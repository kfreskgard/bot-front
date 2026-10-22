import { Layout } from './Layout';

export function LoginPage(props: { error?: string }) {
  return (
    <Layout title="Log in">
      <main class="login">
        <h1>Log in</h1>
        <form method="post" action="/login">
          <label for="password">Password</label>
          <input id="password" name="password" type="password" autocomplete="current-password" autofocus required />
          {props.error ? <p class="error" role="alert">{props.error}</p> : null}
          <button type="submit">Log in</button>
        </form>
      </main>
    </Layout>
  );
}
