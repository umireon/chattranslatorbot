<script lang="ts">
  import { type Analytics, logEvent } from "firebase/analytics";
  import { type AppContext, DEFAULT_CONTEXT } from "../common/constants";
  import { type Auth, type User } from "firebase/auth";
  import Language, { defaultTargetLanguageCode } from "./lib/Language.svelte";
  import { type UserData, setUserData } from "./service/users";

  import { type ChatUserstate } from "tmi.js";
  import Connect from "./lib/Connect.svelte";
  import { type Firestore } from "firebase/firestore";
  import GenerateUrl from "./lib/GenerateUrl.svelte";
  import Logout from "./lib/Logout.svelte";
  import { connectTwitch } from "./service/twitch";
  import { getTwitchLogin } from "../common/twitch";
  import { sendTextFromBotToChat } from "./service/bot";
  import { setKeepAliveInterval } from "./service/keepalive";
  import { translateText } from "./service/translate";

  import "three-dots/dist/three-dots.min.css";

  export let analytics: Analytics;
  export let auth: Auth;
  export let db: Firestore;

  export let user: User;
  export let initialUserData: UserData;

  const context = DEFAULT_CONTEXT;

  let targetLanguageCode =
    initialUserData.targetLanguageCode || defaultTargetLanguageCode;

  $: setUserData(db, user, { targetLanguageCode });

  let error: Error | undefined;

  let twitchLogin: string = "";
  let twitchText: string = "";
  let twitchTranslatedText: string = "";

  export const unescapeHtmlEntities = (text: string): string => {
    const domparser = new DOMParser();
    const doc = domparser.parseFromString(text, "text/html");
    return doc.body.innerText;
  };

  export const translateChat = async (text: string, tags: ChatUserstate) => {
    if (tags.username === context.botUsername) {
      return;
    }

    twitchText = text;
    const { detectedLanguageCode, translatedText } = await translateText(
      context,
      user,
      {
        targetLanguageCode,
        text,
      }
    );
    if (detectedLanguageCode !== targetLanguageCode) {
      logEvent(analytics, "chat_translated");
      const unescapedTranslatedText = unescapeHtmlEntities(translatedText);
      twitchTranslatedText = unescapedTranslatedText;
      await sendTextFromBotToChat(context, user, {
        text: unescapedTranslatedText,
      });
    }
  };

  const initializeTwitch = async (context: AppContext) => {
    const token = initialUserData["twitch-access-token"];
    if (typeof token === "undefined") {
      error = new Error("Token was undefined!");
      return;
    }
    const login = await getTwitchLogin(context, token).catch((e) => {
      if (e instanceof Error) {
        error = e;
      }
    });
    if (typeof login === "undefined") {
      error = new Error("Login was undefined!");
      return;
    }
    twitchLogin = login;
    connectTwitch({ login, token }, translateChat);
  };

  initializeTwitch(DEFAULT_CONTEXT);

  setKeepAliveInterval(user, [
    context.sendTextFromBotToChatEndpoint,
    context.translateTextEndpoint,
  ]);
</script>

<main>
  {#if typeof error !== "undefined"}
    <h2>{error.message}</h2>
  {/if}
  <Language bind:targetLanguageCode />
  <Connect {context} {db} {user} />
  <div>Listening to #{twitchLogin}</div>
  <div>{twitchText} → {twitchTranslatedText}</div>
  <GenerateUrl {db} {user} />
  <Logout {auth} />
</main>
