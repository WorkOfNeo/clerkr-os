import "@/components/numbers/ops/ops-board.css";
import "@/components/numbers/ops/tokens.css";

export const dynamic = "force-dynamic";

export default function NumbersNoAccess() {
  return (
    <div className="ob-root" data-flow>
      <main className="ob">
        <div className="ob-dead">
          <h1>Ikke for denne konto</h1>
          <p>Tallene er for superadmins, eller for den, der har fået et delt link.</p>
        </div>
      </main>
    </div>
  );
}
