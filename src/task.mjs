// A lazy computation value. Construction and composition never start the work.
// Promise supplies execution and captures both thrown exceptions and rejections.
export const task = computation => {
	const run = () => Promise.resolve().then(computation)
	return Object.freeze({
		run,
		map: transform => task(() => run().then(transform)),
		andThen: next => task(() => run().then(value => next(value).run())),
		mapError: transform =>
			task(() => run().catch(reason => Promise.reject(transform(reason)))),
		ensuring: cleanup => task(() => run().finally(cleanup)),
	})
}

export const succeed = value => task(() => value)
export const fail = reason => task(() => Promise.reject(reason))
export const map = transform => program => program.map(transform)
export const andThen = next => program => program.andThen(next)
export const mapError = transform => program => program.mapError(transform)

// Release only after acquisition succeeds, on either success or failure.
export const using = (acquire, use, release) =>
	acquire.andThen(resource =>
		task(() => use(resource).run()).ensuring(() => release(resource)),
	)

// The single terminal boundary. Application callback exceptions are not relabeled
// as service failures: a failing success callback must not dispatch twice.
export const run = (program, success, failure) => {
	void program.run().then(success, failure)
}
