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
   - **Migrate with Gemini and IBM Bob** console, with the Gemini and IBM Bob logos next to the title (real, not simulated): shows a prompt built from the Source and Destination tabs (topology, Cassandra node count, source API server and namespace, Astra host URL and bundle file name, or the HCD cluster). **Migrate** starts the progress bars and submits the prompt to Bob as a background job (`POST /api/jobs`), checks the job status every 5 s, logs each check with a timestamp in the console, and shows status, tool calls and the output so far; **Cancel** cancels the running job. The text under **Deployment Steps** (two steps: deploy the ZDM proxy and check that its 3 pods are Running, then migrate to the target) shows placeholders such as `{{OPENSHIFT_SOURCE_TOKEN}}` and `{{ASTRA_TOKEN}}`; the real tokens, passwords and Astra API key are substituted only when the job is submitted, so they are sent to Bob but never displayed. The bundle contents are not sent, only its file name. Nothing is sent until you click Migrate;

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

The console uses the Bob Jobs API (see `<route>/docs`): `POST /api/jobs` with `{"prompt": "..."}` returns `202` and a job id immediately, and `GET /api/jobs/{id}` returns the status (`queued`, `running`, `completed`, `failed`, `cancelled`), `toolCalls`, `lastActivityAt`, `stopReason`, `error` and the `output` so far. `DELETE /api/jobs/{id}` cancels a running job. The browser cannot call Bob directly (no CORS headers), so the app has a small proxy in `server/bobProxy.js`: `POST /api/bob/jobs`, `GET /api/bob/jobs/:id` and `DELETE /api/bob/jobs/:id` are forwarded to `${BOB_API_URL}/api/jobs[/:id]`. It validates the body, forwards only the prompt, and does not expose the job list. The same proxy is used by `npm run dev`/`npm run preview` (via `vite.config.js`) and by the production server `server/index.js`, which also serves `dist/` and `/healthz`, `/readyz`.

Configure it with one environment variable (see `.env.example`; locally copy to the git-ignored `.env.local`):

```
BOB_API_URL=https://<bob-acp-route>
```

Without it the console shows "Bob proxy not configured". The Bob endpoint has no authentication, so keep the route URL out of committed files. Jobs are kept in Bob's memory only (lost if the Bob pod restarts, and removed some time after finishing), so a lost job shows "Bob job not found". At most a limited number of jobs run at once on the Bob side; the rest show `queued` with a queue position. The API has no read-only or spending-limit parameter, so read-only behaviour relies on the prompt text.

## Deploy to OpenShift (GitHub Actions)

`.github/workflows/deploy.yml` runs on every push to `main` (and manually): tests and build, then, on `main` only, deploys. Pull requests run the tests only and never see secrets.

GitHub repository secrets (Settings > Secrets and variables > Actions):

| Secret | Value |
| --- | --- |
| `OPENSHIFT_SERVER` | API server URL, e.g. `https://c107-e.us-south.containers.cloud.ibm.com:31149` |
| `OPENSHIFT_TOKEN` | Token of a user/service account that can edit the project |
| `BOB_API_URL` | Base URL of the Bob prompt API route |

Deploy steps: log in with `oc`; apply `openshift/01-builds.yaml` (ImageStream + binary BuildConfig); create/update the OpenShift **Secret `opdk-wizard-env`** from `BOB_API_URL`; build the image in the cluster (`Dockerfile`); apply `openshift/02-app.yaml` (Deployment pinned to the built image, Service, TLS Route) and wait for the rollout; smoke test. The Deployment loads the Secret with `envFrom`, and a hash of the secret values is stamped on the pod template, so rotating a GitHub secret and re-running the workflow restarts the pods with the new value.

The target project (default `opdk-migration-wizard`, input `namespace` on manual runs) must already exist: `oc new-project opdk-migration-wizard`. To rotate the OpenShift token: `gh secret set OPENSHIFT_TOKEN`. Login tokens expire, so use a long-lived service-account token for anything beyond a demo.

## Layout

- `src/topologies.js`: topology data
- `src/validation.js`: step definitions, validators
- `server/`: production server and Bob proxy
- `openshift/`, `Dockerfile`, `.github/workflows/deploy.yml`: deployment
- `src/bobPrompt.js`: builds the Deployment Steps text with placeholders, and substitutes the real credentials at submit time
- `src/bobClient.js`: prompt call through the proxy
- `src/components/`: step components (`BobConsole.jsx` is the Bob console)
- `src/__tests__/`: unit and flow tests
