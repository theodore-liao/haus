/** Runs async jobs one at a time, in the order they were started. One failing job does not stop the next. */
export function inOrder() {
  let tail: Promise<void> = Promise.resolve();
  return function run<T>(job: () => Promise<T>): Promise<T> {
    const next = tail.then(job, job);
    tail = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  };
}
