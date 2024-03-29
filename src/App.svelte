<script lang="ts">
  import { type Auth, type User, getAuth } from "firebase/auth";
  import { DEFAULT_CONTEXT, firebaseConfig } from "../common/constants";

  import AppSignedIn from "./AppSignedIn.svelte";
  import Logout from "./lib/Logout.svelte";
  import { authenticateWithToken } from "./service/auth";
  import { getAnalytics } from "firebase/analytics";
  import { getFirestore } from "firebase/firestore";
  import { getUserData } from "./service/users";
  import { initializeApp } from "firebase/app";

  import "three-dots/dist/three-dots.min.css";

  const AUTHENTICATE_MAX_RETRY = 5;

  const initializeUser = async (auth: Auth): Promise<User> => {
    const params = new URLSearchParams(location.hash.slice(1));
    const token = params.get("token");
    const uid = params.get("uid");
    if (token !== null && uid !== null) {
      for (let i = 0; i < AUTHENTICATE_MAX_RETRY; i++) {
        try {
          const credential = await authenticateWithToken(
            DEFAULT_CONTEXT,
            auth,
            {
              token,
              uid,
            }
          );
          return credential.user;
        } catch (e) {
          console.error(e);
        }
      }
      throw new Error("Could not be authenticated");
    } else {
      const user = await new Promise<User>((resolve) =>
        auth.onAuthStateChanged(async (currentUser) => {
          if (currentUser !== null) {
            resolve(currentUser);
          } else {
            throw new Error("Not signed in");
          }
        })
      );
      return user;
    }
  };

  const app = initializeApp(firebaseConfig);
  const analytics = getAnalytics(app);
  const auth = getAuth(app);
  const db = getFirestore(app);
  const promise = initializeUser(auth).then(async (user) => {
    const initialUserData = await getUserData(db, user);
    return { initialUserData, user };
  });
</script>

<main>
  {#await promise}
    <div id="app-loading" class="dot-bricks" style="margin: 10px;" />
  {:then { initialUserData, user }}
    <AppSignedIn {analytics} {auth} {db} {initialUserData} {user} />
  {:catch}
    <h2 style="color: red;">An authentication error was occurred!</h2>
    <Logout {auth} />
  {/await}
</main>
