export const metadata = { title: "Privacy | MoneyFlow" };

export default function PrivacyPage() {
  return (
    <>
      <h1>Informativa privacy</h1>
      <p>Ultimo aggiornamento: 20 settembre 2026. Informativa resa ai sensi dell’art. 13 del Regolamento (UE) 2016/679 (GDPR).</p>

      <h2>Titolare del trattamento</h2>
      <p>
        Titolare: gestore del servizio MoneyFlow (Andrea Pozzi). Contatto per
        richieste sui dati personali:{" "}
        <a href="mailto:andreapozzi408@gmail.com">andreapozzi408@gmail.com</a>.
      </p>

      <h2>Cos’è MoneyFlow</h2>
      <p>
        MoneyFlow è un’applicazione web / PWA di finanza personale: ti consente
        di registrare e organizzare conti, movimenti, categorie, budget e
        obiettivi, e — se configurato e da te attivato — di collegare conti
        bancari in sola lettura (AIS).
      </p>

      <h2>Categorie di dati</h2>
      <ul className="list-disc space-y-2 pl-5">
        <li>
          <strong>Account:</strong> email, password (gestita da Supabase Auth),
          eventuale nome indicato in registrazione.
        </li>
        <li>
          <strong>Dati finanziari inseriti da te:</strong> conti, transazioni,
          categorie, budget, obiettivi, ricorrenti, regole di classificazione,
          import CSV e azioni dell’assistente locale.
        </li>
        <li>
          <strong>Open Banking (opzionale):</strong> identificativi di
          connessione/conto, IBAN o equivalenti restituiti dal fornitore, saldi,
          movimenti e metadati sul consenso/autorizzazione AIS.
        </li>
        <li>
          <strong>Dati tecnici:</strong> cookie/sessione di autenticazione,
          preferenze di interfaccia (es. tema), risorse della PWA sul dispositivo.
        </li>
      </ul>

      <h2>Finalità e basi giuridiche</h2>
      <p>
        I dati servono a fornire il servizio richiesto (esecuzione del
        contratto/servizio): autenticazione, archiviazione e visualizzazione
        delle finanze, classificazione e riepiloghi. Il collegamento bancario è
        facoltativo e si basa sulla tua autorizzazione presso la banca e il
        fornitore AIS; puoi usare MoneyFlow solo con dati manuali. Misure
        tecniche di sicurezza e prevenzione abusi si basano sul legittimo
        interesse a proteggere il servizio.
      </p>

      <h2>Open Banking e fornitori</h2>
      <p>
        L’accesso bancario, quando disponibile, è in <strong>sola lettura
        (AIS)</strong>: MoneyFlow non dispone pagamenti né trasferimenti. Le
        credenziali della banca non vanno inserite in MoneyFlow; l’autenticazione
        avviene presso la banca o il fornitore. A seconda della configurazione
        dell’istanza, il collegamento può passare da{" "}
        <strong>Enable Banking</strong> e/o{" "}
        <strong>GoCardless Bank Account Data</strong>. Autenticazione e database
        sono forniti da <strong>Supabase</strong> (Auth + PostgreSQL);
        l’applicazione è tipicamente ospitata su <strong>Vercel</strong>.
      </p>
      <p>
        Per dettagli su trattamenti e eventuali trasferimenti internazionali
        consulta le informative di{" "}
        <a href="https://enablebanking.com/privacy">Enable Banking</a>,{" "}
        <a href="https://gocardless.com/privacy/">GoCardless</a>,{" "}
        <a href="https://supabase.com/privacy">Supabase</a> e{" "}
        <a href="https://vercel.com/legal/privacy-policy">Vercel</a>. Puoi
        chiedere al contatto sopra quali fornitori sono attivi sulla tua
        istanza.
      </p>

      <h2>Conservazione</h2>
      <p>
        I dati restano finché l’account è attivo e necessari alle finalità
        sopra. La disconnessione di una banca interrompe nuove sincronizzazioni
        ma non cancella automaticamente i movimenti già importati. Puoi
        richiedere la cancellazione dell’account e dei dati al contatto
        indicato. Conservazioni ulteriori possono applicarsi per obblighi di
        legge o gestione di contestazioni, nei limiti previsti; le copie di
        sicurezza seguono i cicli dei fornitori.
      </p>

      <h2>Cookie e archiviazione locale</h2>
      <p>
        Sono usati cookie/sessione per l’accesso e memorizzazioni tecniche
        (preferenze UI, cache PWA). Servono al funzionamento del servizio, non a
        profilazione pubblicitaria di terzi descritta in questa app.
      </p>

      <h2>Diritti dell’interessato</h2>
      <p>
        Puoi esercitare accesso, rettifica, cancellazione, limitazione,
        portabilità e, ove previsto, opposizione. Puoi revocare un consenso
        (es. collegamento bancario) senza pregiudicare il trattamento precedente.
        Hai diritto di proporre reclamo al{" "}
        <a href="https://www.garanteprivacy.it/i-miei-diritti">
          Garante per la protezione dei dati personali
        </a>
        . Invia le richieste a{" "}
        <a href="mailto:andreapozzi408@gmail.com">andreapozzi408@gmail.com</a>{" "}
        senza allegare password o credenziali bancarie.
      </p>
    </>
  );
}
