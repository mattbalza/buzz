import * as React from "react";

import {
  type MediaAvailability,
  probeMediaAvailability,
} from "./mediaAvailability";

/**
 * Track why a piece of media failed, without probing anything that worked.
 *
 * The probe is a second request, so it runs only once a load has already
 * failed — a timeline of fifty attachments must not cost fifty extra
 * round-trips to tell us what the `load` events already told us. Until then the
 * state is `null`: nothing has gone wrong, so there is nothing to explain.
 *
 * The verdict is stored next to the url it describes rather than cleared by an
 * effect, so a probe that lands after the component has moved on to another
 * attachment simply stops matching. It cannot label the new url with the old
 * url's answer, and there is no reset to forget.
 */
export function useMediaAvailability(url: string | undefined): {
  availability: MediaAvailability | null;
  reportFailure: () => void;
} {
  const [probed, setProbed] = React.useState<{
    availability: MediaAvailability;
    url: string;
  } | null>(null);

  const reportFailure = React.useCallback(() => {
    if (!url) return;
    void probeMediaAvailability(url).then((availability) => {
      setProbed({ availability, url });
    });
  }, [url]);

  return {
    availability: probed && probed.url === url ? probed.availability : null,
    reportFailure,
  };
}
