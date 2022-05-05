import type { AppContext } from '../../common/constants'
import type { Auth } from 'firebase/auth'
import { signInWithCustomToken } from 'firebase/auth'

interface AuthenticateWithTokenOptions {
  readonly token: string
  readonly uid: string
}

export const authenticateWithToken = async (
  auth: Auth,
  { authenticateWithTokenEndpoint }: AppContext,
  { token, uid }: AuthenticateWithTokenOptions,
  _fetch = fetch
) => {
  const query = new URLSearchParams({ token, uid })
  const response = await _fetch(`${authenticateWithTokenEndpoint}?${query}`)
  if (!response.ok) throw new Error('Authentication failed')
  const customToken = await response.text()
  const credential = await signInWithCustomToken(auth, customToken)
  return credential
}
