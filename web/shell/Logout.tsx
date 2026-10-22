export function Logout() {
  return (
    <div className="logout">
      <form method="post" action="/logout">
        <button type="submit">Log out</button>
      </form>
    </div>
  );
}
