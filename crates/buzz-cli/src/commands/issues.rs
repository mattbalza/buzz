use crate::client::BuzzClient;
use crate::commands::with_git_provenance;
use crate::error::CliError;
use crate::validate::{read_or_stdin, sdk_err, validate_hex64, validate_repo_id};
use buzz_sdk::{GitIssueMeta, GitRepoCoord, GitStatusMeta};
use nostr::{Event, EventBuilder, Tag};

pub async fn cmd_create_issue(
    client: &BuzzClient,
    repo_owner: &str,
    repo_id: &str,
    subject: &str,
    content: &str,
    labels: &[String],
    to: &[String],
) -> Result<(), CliError> {
    validate_hex64(repo_owner)?;
    validate_repo_id(repo_id)?;
    let body = read_or_stdin(content)?;

    let meta = GitIssueMeta {
        labels: labels.to_vec(),
        recipients: to.to_vec(),
    };

    let repo = GitRepoCoord {
        owner: repo_owner.to_string(),
        id: repo_id.to_string(),
    };

    let builder = with_git_provenance(
        buzz_sdk::build_git_issue(&repo, subject, &body, &meta).map_err(sdk_err)?,
    )?;
    let event = client.sign_event(builder)?;
    let event_id = event.id.to_hex();
    let resp = client.submit_event(event).await?;
    // `link` renders as a rich preview card in Buzz Desktop when included in
    // a chat message — agents announce issues with it (see base_prompt.md).
    let link = crate::links::issue_link(&event_id, repo_owner, repo_id);
    crate::client::print_create_response(&resp, "link", &link);
    Ok(())
}

pub async fn cmd_get_issue(client: &BuzzClient, event: &str) -> Result<(), CliError> {
    validate_hex64(event)?;
    let filter = serde_json::json!({
        "kinds": [1621],
        "ids": [event]
    });
    let resp = client.query(&filter).await?;
    println!("{resp}");
    Ok(())
}

pub async fn cmd_list_issues(
    client: &BuzzClient,
    repo_owner: &str,
    repo_id: &str,
    author: Option<&str>,
    label: Option<&str>,
    limit: Option<u32>,
) -> Result<(), CliError> {
    validate_hex64(repo_owner)?;
    validate_repo_id(repo_id)?;

    let a_value = format!("30617:{repo_owner}:{repo_id}");
    let mut filter = serde_json::json!({
        "kinds": [1621],
        "#a": [a_value]
    });

    if let Some(pk) = author {
        validate_hex64(pk)?;
        filter["authors"] = serde_json::json!([pk]);
    }
    if let Some(l) = label {
        filter["#t"] = serde_json::json!([l]);
    }
    if let Some(n) = limit {
        filter["limit"] = serde_json::json!(n);
    }

    let resp = client.query(&filter).await?;
    println!("{resp}");
    Ok(())
}

/// Comment on an issue. The repo coordinate is required, not optional as it is
/// on `issues status`: the Projects UI fetches comments by `#a` alone, so a
/// comment without it is published successfully and then never shown.
pub async fn cmd_comment_issue(
    client: &BuzzClient,
    repo_owner: &str,
    repo_id: &str,
    issue: &str,
    content: &str,
    to: &[String],
) -> Result<(), CliError> {
    validate_hex64(repo_owner)?;
    validate_repo_id(repo_id)?;
    validate_hex64(issue)?;
    let body = read_or_stdin(content)?;

    let repo = GitRepoCoord {
        owner: repo_owner.to_string(),
        id: repo_id.to_string(),
    };

    let builder = buzz_sdk::build_git_issue_comment(&repo, issue, &body, to).map_err(sdk_err)?;
    let event = client.sign_event(builder)?;
    let resp = client.submit_event(event).await?;
    println!("{resp}");
    Ok(())
}

#[allow(clippy::too_many_arguments)]
pub async fn cmd_issue_status(
    client: &BuzzClient,
    issue: &str,
    status: &str,
    content: Option<&str>,
    repo_owner: Option<&str>,
    repo_id: Option<&str>,
    euc: Option<&str>,
    to: &[String],
) -> Result<(), CliError> {
    validate_hex64(issue)?;
    let status = crate::commands::patches::parse_status(status)?;
    let body = match content {
        Some(c) => read_or_stdin(c)?,
        None => String::new(),
    };

    let repo = match (repo_owner, repo_id) {
        (Some(owner), Some(id)) => {
            validate_hex64(owner)?;
            validate_repo_id(id)?;
            Some(GitRepoCoord {
                owner: owner.to_string(),
                id: id.to_string(),
            })
        }
        (None, None) => None,
        _ => {
            return Err(CliError::Usage(
                "--repo-owner and --repo-id must be given together".into(),
            ))
        }
    };

    // Mirrors `buzz patches status`: default a `p` tag to the repo owner
    // for discoverability, plus a `--to` escape hatch for the issue author
    // or anyone else who should be notified of the status change.
    let mut recipients = Vec::new();
    if let Some(ref repo) = repo {
        recipients.push(repo.owner.clone());
    }
    for recipient in to {
        validate_hex64(recipient)?;
        if !recipients.contains(recipient) {
            recipients.push(recipient.clone());
        }
    }

    let meta = GitStatusMeta {
        root_event: issue.to_string(),
        accepted_revision_root: None,
        repo,
        euc: euc.map(str::to_string),
        recipients,
        applied_patches: vec![],
        merge_commit: None,
        applied_as_commits: vec![],
    };

    let builder =
        with_git_provenance(buzz_sdk::build_git_status(status, &body, &meta).map_err(sdk_err)?)?;
    let event = client.sign_event(builder)?;
    let resp = client.submit_event(event).await?;
    println!("{resp}");
    Ok(())
}

/// Build the NIP-09 deletion event (kind:5) for one regular event.
///
/// Exactly one `e` tag and no `a` tag. Both halves are load-bearing: the relay
/// rejects any kind:5 whose `e`+`a` tag count is not exactly 1, so a batch
/// deletion is not expressible, and an `a` tag would route to the coordinate
/// soft-delete path instead of the per-event one. kind:1621 is immutable and
/// not addressable, so `e` is the only way to reach it.
pub fn build_event_rm(target: &nostr::EventId) -> Result<EventBuilder, CliError> {
    let e_tag = Tag::parse(["e", &target.to_hex()])
        .map_err(|error| CliError::Other(format!("failed to build deletion tag: {error}")))?;
    Ok(EventBuilder::new(nostr::Kind::EventDeletion, "").tags(vec![e_tag]))
}

fn parse_events(json: &str) -> Result<Vec<Event>, CliError> {
    serde_json::from_str(json)
        .map_err(|error| CliError::Other(format!("failed to parse relay response: {error}")))
}

/// Everything we published *under* an issue: comments (kind:1) and status
/// events (kind:1630-1633), both anchored to it by `e`.
///
/// Filtered to our own pubkey because the relay refuses a deletion signed by
/// anyone but the target's author — asking it to delete someone else's comment
/// fails the whole command rather than skipping that one event.
async fn fetch_own_issue_descendants(
    client: &BuzzClient,
    issue: &nostr::EventId,
) -> Result<Vec<Event>, CliError> {
    let filter = serde_json::json!({
        "kinds": [1, 1630, 1631, 1632, 1633],
        "authors": [client.keys().public_key().to_hex()],
        "#e": [issue.to_hex()],
    });
    parse_events(&client.query(&filter).await?)
}

/// Fail loudly on a rejected deletion. Deliberately not reusing the repos
/// module's checker: that one maps `duplicate` to a "repository changed
/// concurrently, retry" conflict, which is both wrong and alarming here — a
/// duplicate deletion is the outcome we wanted.
fn ensure_accepted(raw: &str, target: &nostr::EventId) -> Result<(), CliError> {
    let response: serde_json::Value = serde_json::from_str(raw)
        .map_err(|error| CliError::Other(format!("relay response is not JSON: {error} ({raw})")))?;
    let accepted = response
        .get("accepted")
        .and_then(serde_json::Value::as_bool)
        .unwrap_or(false);
    let message = response
        .get("message")
        .and_then(serde_json::Value::as_str)
        .unwrap_or("");
    if !accepted && !message.starts_with("duplicate") {
        return Err(CliError::Other(format!(
            "relay rejected deletion of {}: {message}",
            target.to_hex()
        )));
    }
    Ok(())
}

async fn delete_one(client: &BuzzClient, target: &nostr::EventId) -> Result<(), CliError> {
    let event = client.sign_event(build_event_rm(target)?)?;
    let raw = client.submit_event(event).await?;
    ensure_accepted(&raw, target)
}

/// Delete an issue and everything published under it.
///
/// Children go first. A deletion is one event per target — the relay caps a
/// kind:5 at exactly one — so this is several round trips, and a failure
/// partway through must not leave comments anchored to an issue that is gone.
pub async fn cmd_rm_issue(client: &BuzzClient, issue: &str) -> Result<(), CliError> {
    validate_hex64(issue)?;
    let issue_id = nostr::EventId::from_hex(issue)
        .map_err(|error| CliError::Usage(format!("invalid issue event id: {error}")))?;

    // Read-before-write, and read our *own* issue: a clean NotFound beats
    // emitting deletions the relay will refuse for want of authorship.
    let own = serde_json::json!({
        "kinds": [1621],
        "authors": [client.keys().public_key().to_hex()],
        "ids": [issue],
        "limit": 1,
    });
    if parse_events(&client.query(&own).await?)?.is_empty() {
        return Err(CliError::NotFound(format!(
            "no issue {issue:?} found for you ({}); nothing to delete",
            client.keys().public_key().to_hex()
        )));
    }

    let descendants = fetch_own_issue_descendants(client, &issue_id).await?;
    let mut comments = 0_usize;
    let mut statuses = 0_usize;
    for child in &descendants {
        delete_one(client, &child.id).await?;
        if child.kind == nostr::Kind::TextNote {
            comments += 1;
        } else {
            statuses += 1;
        }
    }
    delete_one(client, &issue_id).await?;

    // One line of JSON, like every other command here: a caller parses this.
    println!(
        "{}",
        serde_json::json!({
            "deleted": true,
            "issue": issue,
            "comments": comments,
            "statuses": statuses,
        })
    );
    Ok(())
}

pub async fn dispatch(cmd: crate::IssuesCmd, client: &BuzzClient) -> Result<(), CliError> {
    use crate::IssuesCmd;
    match cmd {
        IssuesCmd::Create {
            repo_owner,
            repo_id,
            title,
            content,
            label,
            to,
        } => cmd_create_issue(client, &repo_owner, &repo_id, &title, &content, &label, &to).await,
        IssuesCmd::Comment {
            repo_owner,
            repo_id,
            issue,
            content,
            to,
        } => cmd_comment_issue(client, &repo_owner, &repo_id, &issue, &content, &to).await,
        IssuesCmd::Get { event } => cmd_get_issue(client, &event).await,
        IssuesCmd::Rm { issue } => cmd_rm_issue(client, &issue).await,
        IssuesCmd::List {
            repo_owner,
            repo_id,
            author,
            label,
            limit,
        } => {
            cmd_list_issues(
                client,
                &repo_owner,
                &repo_id,
                author.as_deref(),
                label.as_deref(),
                limit,
            )
            .await
        }
        IssuesCmd::Status {
            issue,
            status,
            content,
            repo_owner,
            repo_id,
            euc,
            to,
        } => {
            cmd_issue_status(
                client,
                &issue,
                &status,
                content.as_deref(),
                repo_owner.as_deref(),
                repo_id.as_deref(),
                euc.as_deref(),
                &to,
            )
            .await
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{build_event_rm, ensure_accepted};
    use nostr::{EventId, Keys, Kind, Tag};

    fn target() -> EventId {
        EventId::from_hex(&"a".repeat(64)).expect("event id")
    }

    #[test]
    fn issue_deletion_targets_exactly_one_event_by_e_tag() {
        // The relay rejects any kind:5 whose e+a tag count is not exactly 1,
        // and an `a` tag would route to the coordinate soft-delete path — which
        // cannot reach kind:1621 at all, since issues are not addressable.
        let keys = Keys::generate();
        let event = build_event_rm(&target())
            .expect("build deletion")
            .sign_with_keys(&keys)
            .expect("sign deletion");

        assert_eq!(event.kind, Kind::EventDeletion);
        assert_eq!(
            event.tags.iter().map(Tag::as_slice).collect::<Vec<_>>(),
            vec![["e".to_string(), "a".repeat(64)].as_slice()],
        );
    }

    #[test]
    fn a_duplicate_deletion_is_the_outcome_we_wanted_not_an_error() {
        // Deleting twice must stay quiet: the second call is how a partially
        // failed purge is retried.
        ensure_accepted(r#"{"accepted":false,"message":"duplicate"}"#, &target())
            .expect("duplicate deletion is success");
    }

    #[test]
    fn a_refused_deletion_names_the_event_it_could_not_delete() {
        // One purge emits many deletions; "rejected" without the id is useless.
        let error = ensure_accepted(
            r#"{"accepted":false,"message":"must be event author"}"#,
            &target(),
        )
        .expect_err("refusal must fail");

        let rendered = error.to_string();
        assert!(rendered.contains("must be event author"), "{rendered}");
        assert!(rendered.contains(&"a".repeat(64)), "{rendered}");
    }
}
