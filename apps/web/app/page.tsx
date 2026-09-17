import { buildChatDisclosureLine, WEB_VOICE_MAX_DURATION_SECONDS } from "@frontdesk-kit/config";
import { clientConfig } from "@/lib/clientConfig";
import { getFeatureFlags } from "@/lib/env";
import { ChatWidget } from "./components/ChatWidget";
import { VoiceWidget } from "./components/VoiceWidget";

const DAY_LABELS: Record<string, string> = {
  mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday",
  fri: "Friday", sat: "Saturday", sun: "Sunday",
};

export default function HomePage() {
  const flags = getFeatureFlags();

  return (
    <main className="page">
      <h1>{clientConfig.businessName}</h1>
      <p className="muted">Serving {clientConfig.serviceArea.join(", ")} - {clientConfig.phoneDisplay}</p>

      <section className="card">
        <h2>Services</h2>
        <ul>
          {clientConfig.services.map((s) => (
            <li key={s.name}>
              <strong>{s.name}</strong> - {s.description}
            </li>
          ))}
        </ul>
        <p className="muted">{clientConfig.pricesPolicy.note}</p>
      </section>

      <section className="card">
        <h2>Hours</h2>
        <table>
          <tbody>
            {clientConfig.hours.map((h) => (
              <tr key={h.day}>
                <td>{DAY_LABELS[h.day]}</td>
                <td>{h.open && h.close ? `${h.open} - ${h.close}` : "Closed"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2>Ask a question</h2>
        <ChatWidget
          businessName={clientConfig.businessName}
          disclosure={buildChatDisclosureLine(clientConfig.businessName)}
        />
      </section>

      {flags.elevenLabs && (
        <section>
          <h2>Talk to the receptionist</h2>
          <VoiceWidget maxDurationSeconds={WEB_VOICE_MAX_DURATION_SECONDS} />
        </section>
      )}
    </main>
  );
}
