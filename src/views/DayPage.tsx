import { addDays } from '../day';
import { Layout } from './Layout';
import { PositionsPanel, type PositionsPanelProps } from './PositionsPanel';

export function DayPage(props: { date: string; today: string; panel: PositionsPanelProps }) {
  const { date, today } = props;
  const prev = addDays(date, -1);
  const next = addDays(date, 1);
  return (
    <Layout title={`bot-front ${date}`}>
      <main>
        <header class="day-header">
          <nav class="day-nav">
            <a href={`/?date=${prev}`} aria-label="Previous day">◀</a>
            <form method="get" action="/" class="date-form">
              <input type="date" name="date" value={date} />
              <button type="submit">Show</button>
            </form>
            {date >= today ? (
              <span class="disabled">▶</span>
            ) : (
              <a href={`/?date=${next}`} aria-label="Next day">▶</a>
            )}
            <a href="/">Today</a>
          </nav>
          <form method="post" action="/logout" class="logout-form">
            <button type="submit">Log out</button>
          </form>
        </header>
        <h1>{date}</h1>
        <PositionsPanel {...props.panel} />
      </main>
    </Layout>
  );
}
