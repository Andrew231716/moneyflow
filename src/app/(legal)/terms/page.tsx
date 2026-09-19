export const metadata = { title: "Termini di utilizzo | MoneyFlow" };

export default function TermsPage() {
  return (
    <>
      <h1>Termini di utilizzo</h1>
      <p>Ultimo aggiornamento: 20 settembre 2026.</p>

      <h2>Il servizio</h2>
      <p>
        MoneyFlow è una PWA di finanza personale gestita dal gestore del servizio
        MoneyFlow (Andrea Pozzi). Contatto:{" "}
        <a href="mailto:andreapozzi408@gmail.com">andreapozzi408@gmail.com</a>.
        Consente di organizzare conti, movimenti, budget e obiettivi e, se
        configurato, di collegare conti bancari in sola lettura.
      </p>

      <h2>Account e uso corretto</h2>
      <p>
        Devi fornire dati veritieri, usare solo conti e informazioni che sei
        autorizzato a gestire e proteggere le credenziali del tuo account. È
        vietato usare il servizio per attività illecite, accessi non
        autorizzati, abuso delle API o tentativi di compromettere sicurezza o
        disponibilità.
      </p>

      <h2>Nessuna consulenza finanziaria</h2>
      <p>
        Categorie, riepiloghi, previsioni, insight e risposte dell’assistente
        locale sono strumenti informativi.{" "}
        <strong>
          Non costituiscono consulenza finanziaria, fiscale, legale o di
          investimento
        </strong>
        . Verifica sempre i dati con gli estratti della tua banca prima di
        decisioni rilevanti.
      </p>

      <h2>Open Banking (AIS, sola lettura)</h2>
      <p>
        Il collegamento bancario è facoltativo e dipende dalla disponibilità
        della banca e del fornitore AIS configurato (Enable Banking e/o
        GoCardless Bank Account Data). MoneyFlow richiede accesso in{" "}
        <strong>sola lettura</strong>: non avvia pagamenti né bonifici. Puoi
        scollegare un conto; i dati già importati restano finché non li
        cancelli o non richiedi la cancellazione dell’account. Banca o fornitore
        possono richiedere una nuova autorizzazione o revocare l’accesso.
      </p>

      <h2>Disponibilità e limitazione di responsabilità</h2>
      <p>
        Il progetto è in evoluzione. Possono verificarsi ritardi, errori di
        sincronizzazione, interruzioni di manutenzione o{" "}
        <strong>indisponibilità di banche, fornitori AIS, Supabase o hosting</strong>
        . Nei limiti consentiti dalla legge applicabile, il gestore non risponde
        di danni derivanti da tali interruzioni, da dati incompleti o da
        decisioni prese sulla base delle informazioni mostrate in app, fatti
        salvi i diritti inderogabili dell’utente (inclusa la responsabilità per
        dolo o colpa grave ove prevista).
      </p>

      <h2>Dati personali</h2>
      <p>
        Il trattamento è descritto nell’
        <a href="/privacy">informativa privacy</a>. Puoi smettere di usare il
        servizio e richiedere la cancellazione dell’account al contatto sopra.
      </p>

      <h2>Aggiornamenti</h2>
      <p>
        Modifiche a questi termini saranno pubblicate in questa pagina con la
        data di aggiornamento. Le condizioni del collegamento bancario restano
        quelle mostrate durante il percorso di autorizzazione presso banca e
        fornitore.
      </p>
    </>
  );
}
