# Google Apigee - Cassandra migration

React wizard for migrating the Cassandra database of a Google Apigee Edge for Private Cloud (OPDK v4.53.01) installation.

## Status

Steps implemented so far (UI and validation only):

1. **OPDK topology**: choose one of the six topologies from the [Apigee docs](https://docs.apigee.com/private-cloud/v4.53.01/installation-topologies) (1, 2, 5, 9, 13, 12-node). All-in-One is preselected for the demo; any can be chosen.
2. **Source Kubernetes environment**: API server URL, namespace, bearer token or username/password.
3. **Destination**: one step with the platform choice (Astra is preselected). Astra DB (Cloud) asks for the host URL, API key and secure connection bundle (.zip) and has no Kubernetes cluster section. DataStax HCD asks for the destination Kubernetes cluster fields (same as step 2).
4. **Review**: summary with secrets masked. The **Next** button opens the Migration tab.
5. **Migration**: the Bob console is at the top and the two progress sections below it. The progress bars stay at 0% until you click **Migrate** in the Bob console. Each section has its own progress bar and item list (Done / In progress / Pending), run in order:
   - **Connectivity and ZDM proxy**: connect to source, connect to destination (Astra or HCD cluster), deploy the Zero Downtime Migration (ZDM) proxy pods, validate connectivity from source to the ZDM proxy.
   - **Data migration**: export schema, create schema on the destination, copy data, verify migrated data.
   - **Migrate with Gemini and IBM Bob** console, with the Gemini and IBM Bob logos next to the title (real, not simulated): shows a prompt built from the Source and Destination tabs (topology, Cassandra node count, source API server and namespace, Astra host URL and bundle file name, or the HCD cluster). **Migrate** starts the progress bars and sends the prompt to Bob (`POST /api/prompt`) and shows the session id, activity and output; **Cancel** stops waiting. Tokens, passwords, the API key and the bundle contents are never put in the prompt. Nothing is sent until you click Migrate;

Not implemented: the two progress bars in the Migration tab show **simulated** progress only (one placeholder phase every 1.5 s, see `src/components/MigrationStep.jsx`). No cluster is contacted and no data is moved. The phase list is a placeholder until the real steps are defined. Further steps are to be added.

Notes:
- Credentials are kept in React state only; nothing is written to localStorage/sessionStorage.
- Cassandra node counts per topology are derived from the node layouts on the Apigee page.
- Namespace defaults (`apigee`, `cassandra`) are placeholders.

## Run

```
npm install
npm run dev     # http://localhost:5173
npm test
npm run build
```

## Bob proxy

The console calls the Bob prompt API (`POST <route>/api/prompt` with `{"prompt": "..."}`). The browser cannot call it directly (no CORS headers), so `vite.config.js` adds a small middleware, `POST /api/bob/prompt`, that forwards the body to `${BOB_API_URL}/api/prompt`. It works with `npm run dev` and `npm run preview` only; a production deployment needs its own backend that does the same. Configure it with an environment variable (see `.env.example`; copy to the git-ignored `.env.local`):

```
BOB_API_URL=https://<bob-acp-route>
```

Without it the console shows "Bob proxy not configured". The endpoint used here has no authentication, so keep the route URL out of committed files. The API is synchronous: one request returns `{sessionId, output, updates[], result.stopReason}` when Bob finishes, which can take minutes (the proxy waits up to 10 minutes). There is no job id, so **Cancel** only stops waiting in the browser; Bob may still complete the request. The API has no read-only or spending-limit parameter, so read-only behaviour relies on the prompt text.

## Layout

- `src/topologies.js`: topology data
- `src/validation.js`: step definitions, validators
- `src/bobPrompt.js`: builds the Bob prompt from the wizard state (no secrets)
- `src/bobClient.js`: prompt call through the proxy
- `src/components/`: step components (`BobConsole.jsx` is the Bob console)
- `src/__tests__/`: unit and flow tests
