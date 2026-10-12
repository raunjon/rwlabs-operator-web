import { describe, expect, it } from 'vitest'
import { PRODUCT_NAME, readConfig } from './config'

describe('readConfig', () => {
  it('uses the product name constant', () => {
    expect(readConfig({}).productName).toBe(PRODUCT_NAME)
    expect(PRODUCT_NAME).toBe('RWLabs')
  })

  it('defaults the API base URL to same-origin (empty string)', () => {
    expect(readConfig({}).apiBaseUrl).toBe('')
  })

  it('keeps a configured API base URL', () => {
    expect(readConfig({ VITE_API_BASE_URL: 'https://api.example.test' }).apiBaseUrl).toBe('https://api.example.test')
  })

  it('strips trailing slashes so paths never get a double slash', () => {
    expect(readConfig({ VITE_API_BASE_URL: 'https://api.example.test//' }).apiBaseUrl).toBe('https://api.example.test')
  })

  it('treats a whitespace-only value as unset', () => {
    expect(readConfig({ VITE_API_BASE_URL: '  ' }).apiBaseUrl).toBe('')
  })

  it.each([
    [{ VITE_APP_ENV: 'staging', MODE: 'production' }, 'staging', true],
    [{ VITE_APP_ENV: ' Staging ', MODE: 'production' }, 'staging', true],
    [{ VITE_APP_ENV: 'production', MODE: 'development' }, 'production', false],
    [{ MODE: 'development' }, 'development', true],
    [{ MODE: 'test' }, 'development', true],
    [{ MODE: 'production' }, 'production', false],
    [{ VITE_APP_ENV: 'qa', MODE: 'production' }, 'production', false],
    [{}, 'production', false],
  ])('reads %o as %s (internal pages: %s)', (env, appEnv, showInternalPages) => {
    expect(readConfig(env)).toMatchObject({ appEnv, showInternalPages })
  })
})
