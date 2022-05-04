import * as irc from 'irc'

import type { TranslateTextOption, TranslateTextResult } from './types.js'

import type { AccessToken } from 'simple-oauth2'
import type { AppContext } from './constants.js'
import { ClientCredentials } from 'simple-oauth2'
import { DEFAULT_CONTEXT } from './constants.js'
import type { Firestore } from 'firebase-admin/firestore'
import type { HttpFunction } from '@google-cloud/functions-framework'
import { SecretManagerServiceClient } from '@google-cloud/secret-manager'
import { TranslationServiceClient } from '@google-cloud/translate'
import fetch from 'node-fetch'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'
import { http } from '@google-cloud/functions-framework'
import { initializeApp } from 'firebase-admin/app'

const handleCors: HttpFunction = (req, res) => {
  const { origin } = req.headers
  if (typeof origin !== 'undefined') {
    const { hostname } = new URL(origin)
    if (hostname === 'localhost') {
      res.set('Access-Control-Allow-Origin', '*')
    } else {
      res.set('Access-Control-Allow-Origin', 'https://chattalker.web.app')
    }
  }

  if (req.method === 'OPTIONS') {
    res.set('Access-Control-Allow-Methods', 'GET')
    res.set('Access-Control-Allow-Headers', 'Authorization')
    res.set('Access-Control-Max-Age', '3600')
    res.status(204).send('')
    return false
  }

  return true
}

const translateText = async (
  client: TranslationServiceClient,
  { glossaryConfig, projectId, targetLanguageCode, text }: TranslateTextOption
): Promise<TranslateTextResult> => {
  const [response] = await client.translateText({
    contents: [text],
    glossaryConfig,
    parent: `projects/${projectId}/locations/global`,
    targetLanguageCode,
  })
  if (typeof response === 'undefined') {
    console.error(JSON.stringify(response))
    throw new Error('Invalid response')
  }

  const translations =
    typeof glossaryConfig === 'undefined'
      ? response.translations
      : response.glossaryTranslations
  if (!Array.isArray(translations) || typeof translations[0] === 'undefined') {
    console.error(JSON.stringify(response))
    throw new Error('Invalid response')
  }

  const { detectedLanguageCode, translatedText } = translations[0]
  if (!detectedLanguageCode || !translatedText) {
    console.error(JSON.stringify(response))
    throw new Error('Invalid response')
  }

  return {
    ...translations[0],
    detectedLanguageCode,
    translatedText,
  }
}

const app = initializeApp()

http('translate-text', async (req, res) => {
  if (!handleCors(req, res)) return

  // Validate environment
  const { PROJECT_ID } = process.env
  if (typeof PROJECT_ID === 'undefined')
    throw new Error('PROJECT_ID not provided')

  // Validate query
  if (req.query.keepAlive === 'true') {
    res.status(204).send('')
    return
  }
  if (typeof req.query.text !== 'string') {
    res.status(400).send('Invalid text')
    return
  }
  const { text } = req.query

  // Translate text
  const translationClient = new TranslationServiceClient()
  const response = await translateText(translationClient, {
    projectId: PROJECT_ID,
    targetLanguageCode: 'en',
    text,
  })

  // Compose response
  res.send(response)
})

export interface TwitchUsersData {
  readonly login: string
}

export interface TwitchUsersResponse {
  readonly data: TwitchUsersData[]
}

export const validateTwitchUsersResponse = (
  arg: any
): arg is TwitchUsersResponse => {
  if (typeof arg === 'undefined' || arg === null) return false
  return Array.isArray(arg.data)
}

export const getTwitchLogin = async (
  { twitchClientId }: AppContext,
  token: string
): Promise<string> => {
  const response = await fetch('https://api.twitch.tv/helix/users', {
    headers: {
      Authorization: `Bearer ${token}`,
      'Client-Id': twitchClientId,
    },
  })
  if (!response.ok) throw new Error('Twitch login could not be retrieved!')
  const json: unknown = await response.json()
  if (!validateTwitchUsersResponse(json)) throw new Error('Invalid response')
  const {
    data: [{ login }],
  } = json
  return login
}

const getUidFromBase64 = (idTokenBase64: string): string => {
  const idToken = Buffer.from(idTokenBase64, 'base64').toString()
  const decodedToken = JSON.parse(idToken)
  if (typeof decodedToken.sub !== 'string') {
    console.error(idToken)
    throw new Error('Invalid idToken')
  }
  return decodedToken.sub
}

const getOrRefreshTwitchAccessToken = async (
  client: ClientCredentials,
  accessTokenJson?: string
): Promise<AccessToken> => {
  const params = { scope: 'chat:write' }
  if (typeof accessTokenJson === 'string') {
    const accessToken = client.createToken(JSON.parse(accessTokenJson))
    if (accessToken.expired()) {
      const refreshedAccessToken = await accessToken.refresh(params)
      return refreshedAccessToken
    } else {
      return accessToken
    }
  } else {
    const accessToken = await client.getToken(params)
    return accessToken
  }
}

const obtainTwitchAccessToken = async (
  { twitchClientId }: AppContext,
  db: Firestore,
  secret: string
): Promise<AccessToken> => {
  const client = new ClientCredentials({
    auth: {
      tokenHost: 'https://id.twitch.tv',
      tokenPath: '/oauth2/token',
    },
    client: {
      id: DEFAULT_CONTEXT.twitchClientId,
      secret,
    },
  })

  const docRef = await db.collection('twitchAccessToken').doc('server').get()
  const data = docRef.data()
  const accessToken = await getOrRefreshTwitchAccessToken(
    client,
    data?.accessTokenJson
  )
  const accessTokenJson = JSON.stringify(accessToken)
  db.collection('twitchAccessToekn').doc('server').set({ accessTokenJson })
  return accessToken
}

interface GetTwitchClientSecretOption {
  readonly name?: string
  readonly projectId: string
  readonly version?: string
}

const DEFAULT_TWITCH_CLIENT_SECRET_VERSION = '1'

const coarseIntoString = (data: Uint8Array | string): string => {
  if (typeof data === 'string') {
    return data
  } else {
    const decoder = new TextDecoder()
    return decoder.decode(data)
  }
}

const getTwitchClientSecret = async (
  client: SecretManagerServiceClient,
  {
    name = 'twitch-client-secret',
    projectId,
    version = DEFAULT_TWITCH_CLIENT_SECRET_VERSION,
  }: GetTwitchClientSecretOption
) => {
  const [response] = await client.accessSecretVersion({
    name: `projects/${projectId}/secrets/${name}/versions/${version}`,
  })
  if (!response.payload || !response.payload.data)
    throw new Error('Invalid response')
  return coarseIntoString(response.payload.data)
}

http('send-text-from-bot-to-chat', async (req, res) => {
  if (!handleCors(req, res)) return

  const db = getFirestore(app)

  // Validate environment
  const { PROJECT_ID } = process.env
  if (typeof PROJECT_ID === 'undefined') {
    throw new Error('PROJECT_ID not provided')
  }

  const secretManagerClient = new SecretManagerServiceClient()
  const clientSecret = await getTwitchClientSecret(secretManagerClient, {
    projectId: PROJECT_ID,
  })

  const password = await obtainTwitchAccessToken(
    DEFAULT_CONTEXT,
    db,
    clientSecret
  )
  console.log(password)

  // Validate query
  const idTokenBase64 = req.get('X-Apigateway-Api-Userinfo')
  if (typeof idTokenBase64 === 'undefined') {
    console.error('X-Apigateway-Api-Userinfo missing')
    res.status(401).send('Unauthorized')
    return
  }
  const uid = getUidFromBase64(idTokenBase64)
  if (typeof req.query.text !== 'string') {
    console.error(req.query)
    res.status(400).send('Invalid text')
    return
  }
  const { text } = req.query

  const docRef = await db.collection('userTwitchLogin').doc(uid).get()
  const data = docRef.data()
  if (typeof data?.login !== 'string') {
    console.error(data)
    throw new Error('Invalid userTwitchLogin')
  }
  const { login } = data

  const client = new irc.Client('irc.chat.twitch.tv:6697', login, {
    channels: [`#${login}`],
  })
  client.say(login, text)

  res.status(204).send('')
})

http('set-twitch-login-to-user', async (req, res) => {
  if (!handleCors(req, res)) return

  const db = getFirestore(app)

  // Validate query
  const idTokenBase64 = req.get('X-Apigateway-Api-Userinfo')
  if (typeof idTokenBase64 === 'undefined') {
    res.status(401).send('Unauthorized')
    return
  }
  const uid = getUidFromBase64(idTokenBase64)
  if (typeof req.query.token !== 'string') {
    res.status(400).send('Invalid token')
    return
  }
  const { token } = req.query

  const login = await getTwitchLogin(DEFAULT_CONTEXT, token)

  await db.collection('userTwitchLogin').doc(uid).set({ login })

  res.status(204).send('')
})

http('authenticate-with-token', async (req, res) => {
  if (!handleCors(req, res)) return

  const auth = getAuth(app)
  const db = getFirestore(app)

  // Validate query
  if (typeof req.query.token !== 'string') {
    res.status(400).send('Invalid token')
    return
  }
  if (typeof req.query.uid !== 'string') {
    res.status(400).send('Invalid uid')
    return
  }
  const { token, uid } = req.query

  // Verify token
  const docRef = await db.collection('users').doc(uid).get()
  const data = docRef.data()
  if (!data) throw new Error('Record could not be fetched')
  const expectedToken = data.token
  if (!expectedToken) throw new Error('token not found')
  if (token !== expectedToken) {
    res.status(401).send({})
    return
  }

  // Generate custom token
  const customToken = await auth.createCustomToken(uid)
  res.send(customToken)
})
