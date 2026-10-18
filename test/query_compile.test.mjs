import test from 'node:test'
import assert from 'node:assert/strict'
import { cpSync, copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

// Check the actual public API with the compiler, not just runtime assertions.
// All probes run in an isolated project with already-downloaded dependencies.
test('query stages and opacity are enforced by the Gleam compiler', () => {
  const project = mkdtempSync(path.join(tmpdir(), 'values-query-contract-'))
  try {
    mkdirSync(path.join(project, 'src/app'), { recursive: true })
    mkdirSync(path.join(project, 'build'))
    for (const file of ['gleam.toml', 'manifest.toml']) copyFileSync(file, path.join(project, file))
    for (const file of ['query.gleam', 'model.gleam']) copyFileSync(path.join('src/app', file), path.join(project, 'src/app', file))
    cpSync('build/packages', path.join(project, 'build/packages'), { recursive: true })
    const check = source => {
      writeFileSync(path.join(project, 'src/probe.gleam'), source)
      const result = spawnSync('gleam', ['build'], { cwd: project, encoding: 'utf8' })
      assert.ifError(result.error)
      return { status: result.status, output: result.stdout + result.stderr }
    }
    const valid = check(`import app/query
import app/model
pub fn example() {
  let assert Ok(prepared) = query.prepare(query.from_input("values"))
  model.SearchService(model.SearchRequestId(1), prepared)
}`)
    assert.equal(valid.status, 0, valid.output)

    const unchecked = check(`import app/query
import app/model
pub fn example() {
  model.SearchService(model.SearchRequestId(1), query.from_input("values"))
}`)
    assert.notEqual(unchecked.status, 0)
    assert.match(unchecked.output, /Type mismatch/)

    const asserted = check(`import app/query
pub fn example() -> query.Query(query.Searchable) {
  query.from_input("values")
}`)
    assert.notEqual(asserted.status, 0)
    assert.match(asserted.output, /Type mismatch/)

    const forged = check(`import app/query
pub fn example() { query.Query("") }`)
    assert.notEqual(forged.status, 0)
    assert.match(forged.output, /opaque|private|Unknown module value/)

    for (const marker of ['Unchecked', 'Searchable']) {
      const constructed = check(`import app/query
pub fn example() { query.${marker} }`)
      assert.notEqual(constructed.status, 0)
      assert.match(constructed.output, /Unknown module value/)
    }
  } finally {
    rmSync(project, { recursive: true, force: true })
  }
})
