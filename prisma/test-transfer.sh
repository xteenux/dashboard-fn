#!/bin/bash
BASE="http://localhost:3000"
JAR="$LOCALAPPDATA/Temp/fd-jar.txt"
rm -f "$JAR"

CSRF=$(curl -sk -c "$JAR" "$BASE/api/auth/csrf" | sed -n 's/.*"csrfToken":"\([^"]*\)".*/\1/p')
echo "csrf: ${CSRF:0:16}..."

LOGIN_CODE=$(curl -sk -o /dev/null -w "%{http_code}" -b "$JAR" -c "$JAR" -X POST "$BASE/api/auth/callback/credentials" \
  --data-urlencode "csrfToken=$CSRF" \
  --data-urlencode "email=hanafi@avtx.studio" \
  --data-urlencode "password=owner123!")
echo "login http: $LOGIN_CODE"

BCA="cmu1h85500004s6n8r311zdu9"
BLU="cmu1h854v0003s6n8k44bg49o"
CAT="cmu1h855l0008s6n8vksxy87s"

RESP=$(curl -sk -w "\n%{http_code}" -b "$JAR" -X POST "$BASE/api/transactions" \
  -H "Content-Type: application/json" \
  -d "{\"date\":\"2026-09-14\",\"amount\":100000,\"type\":\"Transfer-Out\",\"note\":\"test transfer BCA ke Blu\",\"categoryId\":\"$CAT\",\"accountId\":\"$BCA\",\"destAccountId\":\"$BLU\"}")
echo "POST resp:"
echo "$RESP"
