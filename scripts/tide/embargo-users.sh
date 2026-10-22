# shellcheck shell=bash
# Sourced by tcinit.sh after the first admin has enrolled and before the
# firstAdmin -> multiAdmin flip. While the realm is still firstAdmin (threshold 1)
# the script can approve change requests over REST, so every governed change the
# demo needs is made here, once. After the flip each change needs an enclave
# approval in the TideCloak console.
#
# Uses the parent script's helpers: api, get_admin_token, drain_change_requests.

DEMO_USERS=(
  "linh:Linh:Researcher:researcher,_tide_encryptor"
  "sam:Sam:Kettle Health:vendor-kettle,_tide_decryptor"
)
# The free Tide tier allows 5 linked accounts per realm, and a failed enclave
# signup still uses one. Add the wrong-vendor control only when there is room:
#   "jo-acme:Jo:Acme Bank:vendor-acme,_tide_decryptor"   (usernames need >= 3 chars)
ADMIN_EXTRA_ROLES="operator"
INVITES_FILE="${PROJECT_ROOT}/tide-invites.txt"

realm_role_rep() {
  TOKEN="$(get_admin_token)"
  api GET "${TIDECLOAK_LOCAL_URL}/admin/realms/${REALM_NAME}/roles/$1"
  if [[ "${RESP_CODE}" != 2* ]]; then
    echo "ERROR: realm role '$1' not found (HTTP ${RESP_CODE})." >&2
    exit 1
  fi
  printf '%s' "${RESP_BODY}"
}

user_id_of() {
  TOKEN="$(get_admin_token)"
  api GET "${TIDECLOAK_LOCAL_URL}/admin/realms/${REALM_NAME}/users?username=$1&exact=true"
  jq -r '.[0].id // empty' <<< "${RESP_BODY}"
}

grant_realm_roles() {
  local uid="$1" roles_csv="$2" reps="[" sep="" role
  IFS=',' read -r -a _roles <<< "${roles_csv}"
  for role in "${_roles[@]}"; do
    reps+="${sep}$(realm_role_rep "${role}")"
    sep=","
  done
  reps+="]"
  TOKEN="$(get_admin_token)"
  api POST "${TIDECLOAK_LOCAL_URL}/admin/realms/${REALM_NAME}/users/${uid}/role-mappings/realm" \
    -H "Content-Type: application/json" -d "${reps}"
  case "${RESP_CODE}" in
    2*|409) echo "  roles ${roles_csv} -> ${RESP_CODE}" ;;
    *) echo "ERROR: role grant failed (HTTP ${RESP_CODE}): ${RESP_BODY}" >&2; exit 1 ;;
  esac
}

echo "Embargo: granting '${ADMIN_EXTRA_ROLES}' to the admin user..."
grant_realm_roles "${USER_ID}" "${ADMIN_EXTRA_ROLES}"
drain_change_requests "(embargo admin roles)"

echo "Embargo: creating demo users..."
for entry in "${DEMO_USERS[@]}"; do
  IFS=':' read -r uname first last roles <<< "${entry}"
  TOKEN="$(get_admin_token)"
  api POST "${TIDECLOAK_LOCAL_URL}/admin/realms/${REALM_NAME}/users" \
    -H "Content-Type: application/json" \
    -d "{\"username\":\"${uname}\",\"email\":\"${uname}@embargo.example\",\"firstName\":\"${first}\",\"lastName\":\"${last}\",\"enabled\":true,\"emailVerified\":false,\"attributes\":{\"tideInvitable\":[\"true\"]}}"
  case "${RESP_CODE}" in
    2*|409) echo "  create ${uname} -> ${RESP_CODE}" ;;
    *) echo "ERROR: create ${uname} failed (HTTP ${RESP_CODE}): ${RESP_BODY}" >&2; exit 1 ;;
  esac
done
drain_change_requests "(embargo user create)"

: > "${INVITES_FILE}"
for entry in "${DEMO_USERS[@]}"; do
  IFS=':' read -r uname first last roles <<< "${entry}"
  uid="$(user_id_of "${uname}")"
  if [[ -z "${uid}" ]]; then
    echo "ERROR: user ${uname} did not commit." >&2
    exit 1
  fi
  grant_realm_roles "${uid}" "${roles}"
  TOKEN="$(get_admin_token)"
  api POST "${TIDECLOAK_LOCAL_URL}/admin/realms/${REALM_NAME}/tideAdminResources/get-required-action-link?userId=${uid}&lifespan=43200" \
    -H "Content-Type: application/json" -H "Accept: text/plain" \
    -d '["link-tide-account-action"]'
  if [[ "${RESP_CODE}" != 2* ]]; then
    echo "ERROR: enrolment link for ${uname} failed (HTTP ${RESP_CODE}): ${RESP_BODY}" >&2
    exit 1
  fi
  printf '%s %s\n' "${uname}" "${RESP_BODY}" >> "${INVITES_FILE}"
done
drain_change_requests "(embargo role grants)"

echo ""
echo "──────────────────────────────────────────────────────────────────────"
echo "  ACTION REQUIRED: enrol each demo user (one private window each):"
echo ""
sed 's/^/    /' "${INVITES_FILE}"
echo ""
echo "  Links are also in ${INVITES_FILE} (gitignored). Waiting for all users..."
echo "──────────────────────────────────────────────────────────────────────"
for entry in "${DEMO_USERS[@]}"; do
  IFS=':' read -r uname _ <<< "${entry}"
  while true; do
    TOKEN="$(get_admin_token)"
    ATTRS=$(curl -s "${TIDECLOAK_LOCAL_URL}/admin/realms/${REALM_NAME}/users?username=${uname}&exact=true&briefRepresentation=false" \
      -H "Authorization: Bearer ${TOKEN}" -H "Cache-Control: no-store")
    KEY=$(jq -r '.[0].attributes.tideUserKey[0] // empty' <<< "${ATTRS}")
    VUID=$(jq -r '.[0].attributes.vuid[0] // empty' <<< "${ATTRS}")
    if [[ -n "${KEY}" && -n "${VUID}" ]]; then
      echo "  ${uname} enrolled."
      break
    fi
    printf "  waiting for %s...\r" "${uname}"
    sleep 4
  done
done
drain_change_requests "(embargo enrolments)"
rm -f "${INVITES_FILE}"
