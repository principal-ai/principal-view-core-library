/**
 * Renderer-side RPC spine for the trail-viewer mainview.
 *
 * Owns the electrobun view instance and the module-scope singletons the view
 * surfaces share (tab-reload + library-refresh subscriptions). Components
 * import `electrobun` / `refreshLibrary` / `reloadSubscribers` / `callReadFile`
 * from here instead of re-initializing the bridge or prop-drilling the refresh
 * callbacks. The RPC *schema* and payload types come from src/shared/contract.ts
 * — the single cross-process contract shared with the bun host.
 */

import Electrobun, { Electroview } from "electrobun/view";
import type {
	TrailViewerMessages,
	TrailViewerRequests,
} from "../shared/contract";

type TrailViewerRPC = {
	bun: {
		requests: TrailViewerRequests;
		messages: TrailViewerMessages;
	};
	webview: {
		requests: Record<string, never>;
		messages: TrailViewerMessages;
	};
};

// Subscribers wired up in App: each becomes a callback that re-runs listTabs.
// The bun host fires `tabsChanged` after tabs open/close; the callback receives
// the host's focus suggestion (a tab it wants on screen) so the renderer can
// apply it to its own active-tab state.
export const reloadSubscribers = new Set<(focusTabId?: string) => void>();

// The mounted Agent Sessions view registers here so it re-fetches sessions the
// host's warm-up worker just refreshed (their disk cache is now fresh). The
// host fires `sessionsUpdated` after a live-refresh pass completes.
export const sessionRefreshers = new Set<(sessionIds: string[]) => void>();

// The mounted LibraryView registers its refresh here so the top-level AppHeader
// can trigger a re-fetch of the trail list without prop-drilling through
// ActiveTab. Only the library tab's view registers, so this is effectively a
// single-entry set.
export const libraryRefreshers = new Set<() => void>();
export function refreshLibrary(): void {
	for (const fn of libraryRefreshers) fn();
}

const rpc = Electroview.defineRPC<TrailViewerRPC>({
	maxRequestTime: 30000,
	handlers: {
		requests: {},
		messages: {
			tabsChanged: (payload) => {
				for (const fn of reloadSubscribers) fn(payload?.focusTabId);
			},
			sessionsUpdated: (payload) => {
				const sessionIds = payload?.sessionIds ?? [];
				if (sessionIds.length === 0) return;
				for (const fn of sessionRefreshers) fn(sessionIds);
			},
		},
	},
});

export const electrobun = new Electrobun.Electroview({ rpc });

export function callReadFile(tabId: string, path: string): Promise<string> {
	return electrobun.rpc!.request.readFile({ tabId, path }).then((res) => {
		if (!res.ok) throw new Error(res.error ?? "readFile failed");
		return res.content ?? "";
	});
}
