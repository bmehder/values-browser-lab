// The Gleam bridge: compose a program, then execute it at this boundary.
import { map, pipe } from 'ramda'
import { Story, StoryTitle, StoryUrl } from './model.mjs'
import { toList } from '../gleam_stdlib/gleam.mjs'
import { run } from './task.mjs'
import {
	copyProgram,
	restoreProgram,
	saveProgram,
	searchProgram,
	waitProgram,
} from './browser_programs.mjs'
export { now } from './browser_programs.mjs'

const toStory = ({ title, url }) =>
  new Story(new StoryTitle(title), new StoryUrl(url))

const toStories = pipe(map(toStory), toList)

export const search = (query, success, failure) =>
	run(searchProgram(query).map(toStories), success, failure)

export const save = (text, success, failure) =>
	run(saveProgram(text), success, failure)

export const restore = (success, failure) => run(restoreProgram, success, failure)

export const copy = (text, success, failure) =>
	run(copyProgram(text), success, failure)

export const delay = (milliseconds, finished) =>
	run(waitProgram(milliseconds), finished, reportUnexpectedFailure)

// A failed platform timer is outside the app's current TimerElapsed protocol.
const reportUnexpectedFailure = error =>
	console.error('Browser timer failed:', error)
