import { onSnapshot, type DocumentReference, type DocumentSnapshot, type Query, type QuerySnapshot } from 'firebase/firestore';

/**
 * onSnapshot that resubscribes after an error. Access can be briefly denied right
 * after sign-up/approval (the local copy of the member doc updates before the
 * server has committed it), and a plain listener would stay dead after that.
 */
export function liveQuery(q: Query, next: (snap: QuerySnapshot) => void, onError?: (e: Error) => void): () => void;
export function liveQuery(q: DocumentReference, next: (snap: DocumentSnapshot) => void, onError?: (e: Error) => void): () => void;
export function liveQuery(q: Query | DocumentReference, next: (snap: never) => void, onError?: (e: Error) => void) {
  let unsub = () => {};
  let timer: number | undefined;
  let attempt = 0;
  let stopped = false;
  const start = () => {
    unsub = onSnapshot(
      q as Query,
      (snap) => {
        attempt = 0;
        next(snap as never);
      },
      (err) => {
        if (stopped) return;
        if (attempt >= 2) onError?.(err);
        timer = window.setTimeout(start, Math.min(500 * 2 ** attempt++, 10_000));
      },
    );
  };
  start();
  return () => {
    stopped = true;
    window.clearTimeout(timer);
    unsub();
  };
}
