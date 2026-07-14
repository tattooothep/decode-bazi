# EAS iOS Owner Checklist

Complete this checklist before Jarvis adopts the EAS templates. Record the five non-secret configuration values in the owner-approved handoff channel; put credentials only into Apple, Expo, or the repository secret store. Never paste a credential into Git, a ticket, a build log, or chat.

## Five values Jarvis may merge into app configuration

- [ ] `OWNER_INPUT_EXPO_OWNER`: exact Expo account or organization slug that owns the project.
- [ ] `OWNER_INPUT_EAS_PROJECT_ID`: exact EAS project UUID shown by Expo for this app.
- [ ] `OWNER_INPUT_IOS_BUNDLE_IDENTIFIER`: owner-approved reverse-DNS identifier.
- [ ] `OWNER_INPUT_APPLE_TEAM_ID`: exact Apple Team ID for the selected developer team.
- [ ] `OWNER_INPUT_IOS_BUILD_NUMBER`: decimal build-number string that is greater than every build already uploaded for this bundle ID.

These values identify configuration; they are not passwords. The Apple password, two-factor code, signing keys, and Expo access-token value remain outside Git.

## 1. Apple Developer Program authority

- [ ] The legal Account Holder confirms that the Apple Developer Program has active membership.
- [ ] The Account Holder confirms all accepted agreements are current and no compliance review blocks builds.
- [ ] Record the exact legal team name and Team ID from Apple Developer membership details.
- [ ] Name one authorized credential operator. For an organization, that person must have a role with Certificates, Identifiers & Profiles access; Account Holder or Admin is preferred for distribution-certificate work.
- [ ] The operator can complete Apple two-factor authentication in the one-time interactive bootstrap.

Do not delegate the Account Holder's legal duties to Jarvis. Apple documents the role boundary in [Roles and access](https://developer.apple.com/help/account/access/roles) and [App Store Connect role permissions](https://developer.apple.com/help/app-store-connect/reference/account-management/role-permissions/).

## 2. App Store Connect state and access

- [ ] Confirm whether the Hourkey App Store Connect record already exists on the selected team; record its status without creating a duplicate.
- [ ] Confirm the authorized operator has access to that app. Organization operators also need Certificates, Identifiers & Profiles access for signing work.
- [ ] Confirm the Account Holder has accepted any current business agreements.
- [ ] Confirm no pending compliance review blocks creation or update of the app.

Reference: [Overview of accounts and roles](https://developer.apple.com/help/app-store-connect/manage-your-team/overview-of-accounts-and-roles).

## 3. Expo owner and EAS project

- [ ] Select the Expo account or organization that will own `@owner/hourkey-mobile`; record its exact slug as `OWNER_INPUT_EXPO_OWNER`.
- [ ] Choose exactly one branch below for `@owner/hourkey-mobile`: existing remote project or owner-authorized new remote project. Never create a second project for an existing app.
- [ ] Existing branch: open the existing Expo project as its owner, confirm its slug is `hourkey-mobile`, and copy the project UUID shown by `eas project:info` or resolved `extra.eas.projectId` into `OWNER_INPUT_EAS_PROJECT_ID`.
- [ ] New branch: before Jarvis starts the handoff, the Expo owner creates the remote project once from a disposable clean copy using the commands below, records the emitted owner and UUID, and retains the copy as evidence until the first build passes. Do not run this branch against the working mobile repository.
- [ ] Record the resulting exact EAS project UUID as `OWNER_INPUT_EAS_PROJECT_ID`; the main handoff only links this ID and never creates a project.
- [ ] Confirm the owner and authorized operator can view the project and trigger iOS builds.
- [ ] Confirm current EAS plan build capacity, concurrency, and expected build charges for two bootstrap builds and later CI builds.

Reference: [Create the first EAS build](https://docs.expo.dev/build/setup/) and [Expo programmatic access](https://docs.expo.dev/accounts/programmatic-access/).

Owner-authorized new-project precreation, only when the existing-project search found nothing:

```bash
set -euo pipefail
: "${MOBILE_REPO:?Set MOBILE_REPO to the source mobile repository path}"
: "${DISPOSABLE_MOBILE_COPY:?Set a new empty path for the disposable copy}"
: "${OWNER_APPROVED_MOBILE_COMMIT:?Set the exact owner-approved mobile commit SHA}"
test ! -e "$DISPOSABLE_MOBILE_COPY"
git clone --no-hardlinks "$MOBILE_REPO" "$DISPOSABLE_MOBILE_COPY"
cd "$DISPOSABLE_MOBILE_COPY"
git checkout --detach "$OWNER_APPROVED_MOBILE_COMMIT"
test -z "$(git status --porcelain --untracked-files=all)"
npm ci
unset EXPO_TOKEN
npx --yes eas-cli@21.0.0 login
npx --yes eas-cli@21.0.0 whoami
npx --yes eas-cli@21.0.0 project:init
npx --yes eas-cli@21.0.0 project:info
npx expo config --type public --json > eas-project-created.json
node -e '
  const fs = require("node:fs");
  const config = JSON.parse(fs.readFileSync("eas-project-created.json", "utf8"));
  const projectId = config.extra?.eas?.projectId;
  if (!config.owner || !projectId) throw new Error("Owner or EAS project UUID is absent");
  console.log(JSON.stringify({ owner: config.owner, slug: config.slug, projectId }, null, 2));
'
```

The Expo owner explicitly approves the owner/slug shown by the prompts. Copy the printed `owner` into `OWNER_INPUT_EXPO_OWNER` and `projectId` into `OWNER_INPUT_EAS_PROJECT_ID`; do not commit `eas-project-created.json`, and do not create another project when the main runbook starts.

## 4. Bundle identifier and App ID

- [ ] In Certificates, Identifiers & Profiles, search the selected team for the current app identifier `io.hourkey.app`.
- [ ] If it exists, confirm it belongs to this app and reuse it. Never create a duplicate App ID for an existing app.
- [ ] If it does not exist, the Account Holder approves one final reverse-DNS bundle ID and an authorized operator registers that exact explicit App ID once.
- [ ] Record the final value as `OWNER_INPUT_IOS_BUNDLE_IDENTIFIER` and confirm it matches the App Store Connect record.
- [ ] Confirm the App ID capabilities needed by the resolved Expo config, including Associated Domains, Push Notifications, and In-App Purchase.

Reference: [Register an App ID](https://developer.apple.com/help/account/identifiers/register-an-app-id/).

## 5. Store metadata and version state

- [ ] Record the highest existing TestFlight or App Store build number for the final bundle ID.
- [ ] Choose `OWNER_INPUT_IOS_BUILD_NUMBER` greater than that number. It seeds remote version state; EAS then increments it remotely.
- [ ] Confirm display name, support URL, privacy URL, SKU, primary language, legal entity, and the export compliance answer.
- [ ] Confirm whether production distribution is authorized. This handoff builds only; a separate owner approval is still required before submission.
- [ ] Because the app uses `expo-iap`, confirm the Paid Applications Agreement, banking, tax, and in-app-purchase access are active before store submission work begins.

Reference: [Apple Developer Program roles](https://developer.apple.com/help/account/access/roles) and [Expo app version management](https://docs.expo.dev/build-reference/app-versions/).

## 6. EAS-managed remote signing

- [ ] The selected Expo project has the correct Apple Distribution certificate available through EAS-managed remote credentials.
- [ ] The production profile has an App Store provisioning profile for the final App ID and certificate.
- [ ] The preview profile has an Ad Hoc provisioning profile for the same App ID and certificate.
- [ ] Every intended preview iPhone or iPad UDID is registered on the selected Apple team before the preview profile is generated.
- [ ] An APNs key is available to the project for `expo-notifications`, and the operator has checked Apple account limits before creating or revoking a key.
- [ ] The operator knows which existing assets must be reused; do not revoke working shared credentials just to make this build pass.

Never place a `.p8`, `.p12`, provisioning profile, Apple password, or private key in Git. EAS remote credential setup happens only in the authorized interactive bootstrap. References: [Expo app credentials](https://docs.expo.dev/app-signing/app-credentials/), [using existing credentials](https://docs.expo.dev/app-signing/existing-credentials/), and [create an App Store provisioning profile](https://developer.apple.com/help/account/provisioning-profiles/create-an-app-store-provisioning-profile).

## 7. CI token ownership

- [ ] Preferred organization branch: an Expo Owner/Admin creates a dedicated Robot user for Hourkey CI and assigns the `Developer` role, the lowest documented organization role that can create builds. Record the robot identity and role. Do not give it Owner or Admin.
- [ ] The owner acknowledges that Expo's `Developer` role can also release updates and manage credentials; the workflow reduces operational scope with `--freeze-credentials` and no update/submit command, but the token's account role remains broader than one build action.
- [ ] Personal-account fallback: use a personal access token only when a Robot user is unavailable and the owner explicitly approves the personal access token breadth. Expo states that it acts on all content in that person's Personal Account and every Personal Account or Organization they can access. Record that exception and use an operator with no unrelated account access.
- [ ] The selected Robot user or explicitly approved fallback identity creates an access token that can build the selected project.
- [ ] An administrator inserts its value directly into the mobile repository secret named `EXPO_TOKEN`; nobody sends the value to Jarvis.
- [ ] Record a rotation owner and review date outside Git.
- [ ] Test the token with `npx --yes eas-cli@21.0.0 whoami` and confirm it returns the recorded Robot user or approved fallback identity, then revoke it immediately if it is exposed, its scope changes, or the owner rotates access.
- [ ] Confirm workflow logs display only the secret name, never the value.

Reference: [Expo programmatic access](https://docs.expo.dev/accounts/programmatic-access/), [Expo account roles](https://docs.expo.dev/accounts/account-types/), and [trigger builds from CI](https://docs.expo.dev/build/building-on-ci/).

## 8. Associated Domains and AASA

- [ ] Keep the existing `applinks:hourkey.io` Associated Domains entry while merging iOS config.
- [ ] Confirm the deployed AASA file contains the application identifier `<APPLE_TEAM_ID>.<IOS_BUNDLE_IDENTIFIER>` using the two approved values.
- [ ] Confirm the AASA response is reachable without redirect, has the correct content type, and covers the reset-password and verify-email paths used by the app.
- [ ] Do not change or deploy the AASA file under this handoff. Any server change is a separately approved backend goal.

Reference: [Supporting associated domains](https://developer.apple.com/documentation/xcode/supporting-associated-domains).

## Owner release gate

The pack is ready for Jarvis only when every box above is checked, the five placeholder values are complete, the starting mobile commit SHA is explicitly approved, and the authorized operator is available for the one-time Apple/Expo bootstrap. This approval permits build setup only. It does not authorize an App Store submission, production deployment, backend change, credential revocation, or entitlement deployment.
