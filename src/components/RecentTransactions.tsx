import { Link } from "react-router-dom";
import { formatDateVN, formatMoney } from "../lib/calc";
import { resolveInstrumentIsin } from "../lib/instrument";
import {
  presentTransaction,
  takeRecentTransactions,
} from "../lib/transactionPresentation";
import type { Transaction } from "../lib/types";
import { VWCE_ISIN } from "../lib/types";
import "../styles/ownership-journal.css";

type Props = {
  transactions: Transaction[];
  limit?: number;
};

function describeTransaction(transaction: Transaction): string {
  const parts = [formatDateVN(transaction.date)];
  const isin = resolveInstrumentIsin(transaction);
  if (isin) parts.push(isin === VWCE_ISIN ? "VWCE" : isin);
  if (transaction.source === "trade_republic_pdf") parts.push("TR PDF");
  if (transaction.quantity != null) {
    parts.push(
      `${transaction.quantity.toLocaleString("vi-VN", { maximumFractionDigits: 4 })} đơn vị`,
    );
  }
  const notes = transaction.notes.trim();
  if (notes) parts.push(notes);
  return parts.join(" · ");
}

export default function RecentTransactions({ transactions, limit = 3 }: Props) {
  const liveCount = transactions.filter((transaction) => !transaction.deletedAt).length;
  const recent = takeRecentTransactions(transactions, limit);
  const showSparseCta = liveCount > 0 && liveCount < 3;

  return (
    <section className="ownership-journal" aria-labelledby="ownership-journal-title">
      <header className="ownership-journal-head">
        <div>
          <p className="ownership-journal-eyebrow">Nhật ký sở hữu</p>
          <h2 id="ownership-journal-title">Giao dịch gần đây</h2>
        </div>
        <Link to="/transactions" className="ownership-journal-count">
          <span>{liveCount} mục</span>
          <span aria-hidden>›</span>
        </Link>
      </header>

      {recent.length > 0 ? (
        <div className="ownership-journal-list">
          {recent.map((transaction) => {
            const presentation = presentTransaction(transaction.type);
            const amount = `${presentation.amountPrefix}${formatMoney(Math.abs(transaction.amount))}`;
            return (
              <Link
                key={transaction.id}
                to="/transactions"
                className="ownership-journal-row"
                aria-label={`${presentation.label}, ${amount}, ${describeTransaction(transaction)}`}
              >
                <span
                  className={`ownership-journal-icon ownership-journal-icon--${presentation.tone}`}
                  aria-hidden
                >
                  {presentation.glyph}
                </span>
                <span className="ownership-journal-copy">
                  <strong>{presentation.label}</strong>
                  <span>{describeTransaction(transaction)}</span>
                </span>
                <span className="ownership-journal-tail">
                  <strong className={`ownership-journal-amount ownership-journal-amount--${presentation.tone}`}>
                    {amount}
                  </strong>
                  <span className="ownership-journal-chevron" aria-hidden>›</span>
                </span>
              </Link>
            );
          })}
          {showSparseCta ? (
            <Link to="/transactions" className="ownership-journal-add">
              <span>Ghi giao dịch</span>
              <span aria-hidden>→</span>
            </Link>
          ) : null}
        </div>
      ) : (
        <div className="ownership-journal-empty">
          <p>Chưa có giao dịch trong sổ local.</p>
          <Link to="/transactions">Ghi giao dịch đầu tiên</Link>
        </div>
      )}
    </section>
  );
}
