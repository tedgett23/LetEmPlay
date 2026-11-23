import { version } from '$app/env';

/** Only mounted on the home page. Open games never reload to apply a deployment. */
export function watchHomeUpdates() {
	if (!('serviceWorker' in navigator)) return;
	const workers = navigator.serviceWorker;
	let reloading = false;
	function askVersion() {
		workers.controller?.postMessage('letemplay:check-version');
	}
	function check() {
		if (document.visibilityState !== 'visible') return;
		askVersion(); // also catches an update installed while a game was open
		if (navigator.onLine)
			void workers
				.getRegistration()
				.then((reg) => reg?.update())
				.catch(() => {
					// The host may be unreachable. The last complete install remains playable.
				});
	}
	function onVersion(event: MessageEvent<unknown>) {
		const msg = event.data;
		if (
			!reloading &&
			document.visibilityState === 'visible' &&
			event.source === workers.controller &&
			msg &&
			typeof msg === 'object' &&
			'type' in msg &&
			msg.type === 'letemplay:active-version' &&
			'version' in msg &&
			typeof msg.version === 'string' &&
			msg.version !== version
		) {
			reloading = true;
			location.reload();
		}
	}
	workers.addEventListener('message', onVersion);
	workers.addEventListener('controllerchange', askVersion);
	window.addEventListener('online', check);
	document.addEventListener('visibilitychange', check);
	check();
	return () => {
		workers.removeEventListener('message', onVersion);
		workers.removeEventListener('controllerchange', askVersion);
		window.removeEventListener('online', check);
		document.removeEventListener('visibilitychange', check);
	};
}
