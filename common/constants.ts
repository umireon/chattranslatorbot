export interface AppContext {
  readonly authenticateWithTokenEndpoint: string;
  readonly botUsername: string;
  readonly sendTextFromBotToChatEndpoint: string;
  readonly setTwitchLoginToUserEndpoint: string;
  readonly translateTextEndpoint: string;
  readonly twitchClientId: string;
}

export const DEFAULT_CONTEXT: AppContext = {
  authenticateWithTokenEndpoint:
    "https://chattranslatorbot-d74nt8ye.an.gateway.dev/authenticate-with-token",
  botUsername: "chattranslatorbot",
  sendTextFromBotToChatEndpoint:
    "https://chattranslatorbot-d74nt8ye.an.gateway.dev/send-text-from-bot-to-chat",
  setTwitchLoginToUserEndpoint:
    "https://chattranslatorbot-d74nt8ye.an.gateway.dev/set-twitch-login-to-user",
  translateTextEndpoint:
    "https://chattranslatorbot-d74nt8ye.an.gateway.dev/translate-text",
  twitchClientId: "39jqiicnwfja9cefwut98bi59727fm",
} as const;

export const firebaseConfig = {
  apiKey: "AIzaSyBhOCCQhHwwR7LBJOOstvdYBdY2PTWa4NA",
  appId: "1:1034253470102:web:a4567a1b21cc44edafb5b7",
  authDomain: "chattranslatorbot.firebaseapp.com",
  measurementId: "G-Q8LDQFFZJS",
  messagingSenderId: "1034253470102",
  projectId: "chattranslatorbot",
  storageBucket: "chattranslatorbot.appspot.com",
} as const;
