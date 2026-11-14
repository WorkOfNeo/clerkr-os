import "@/components/numbers/ops/ops-board.css";
import "@/components/numbers/ops/tokens.css";

export const dynamic = "force-dynamic";

export default function NumbersUnavailable() {
  return (
    <div className="ob-root" data-flow>
      <main className="ob">
        <div className="ob-dead">
          <h1>Linket virker ikke længere</h1>
          <p>Det er blevet trukket tilbage eller er udløbet. Bed den, der delte det, om et nyt.</p>
        </div>
      </main>
    </div>
  );
}
