# 복권 번호 알림봇

매주 **월요일 09:00(KST)** 에 디스코드로 그 주 번호를 보내줍니다.

- **로또 6/45**: 점수 1~5위 5게임 (5,000원)
- **연금복권720+**: 점수 1위 번호를 1~5조 모두(모든조, 5,000원) + 예비 번호 2개(2~3위)
- 지난주 추천번호의 당첨 결과와 누적 성적

번호마다 **점수 = 역대 빈도 50% + 최근 52회 빈도 30% + 미출현 기간 20%** (1.00이 평균)를 매기고, 합계·홀짝·연속번호 조건을 통과한 조합 중 점수 합계가 높은 순서로 줍니다.

연금복권은 조+번호 조합마다 온라인 표가 한 장뿐이라, 다른 사람이 먼저 샀으면 살 수 없어요. 그럴 때 디스코드에서 아래 명령어를 쓰면 됩니다.

| 명령어 | 용도 |
|---|---|
| `/연금` | 다음 순위 모든조용 번호 + 예비 2개 |
| `/연금 조:3` | 그 조에만 쓸 다음 순위 번호 3개 (나머지 조는 원래 번호로 구매) |
| `/로또` | 다음 순위 5게임 |

명령어는 이번 회차에 이미 준 번호를 빼고, 남은 것 중 점수가 높은 순서로 줍니다.

> 추첨은 매회 독립적인 무작위입니다. 1044회 백테스트에서 어떤 점수 방식도 무작위보다 잘 맞히지 못했어요. 점수는 고를 기준일 뿐 당첨 확률을 올리지는 않고, 실제 성적은 월요일 알림의 누적 성적으로 확인할 수 있어요.

## 구성

웹 화면 없이 Netlify Functions만으로 동작합니다.

| 함수 | 역할 |
|---|---|
| `lottery-weekly-scheduled` | 월요일 09:00 KST(월요일 00:00 UTC)에 자동 실행 |
| `GET /api/lottery-picks` | 이번 주 번호를 JSON으로 미리보기 (발송 안 함) |
| `POST /api/lottery-picks?token=…` | 월요일 알림을 지금 바로 발송 |
| `/api/discord-interactions` | 디스코드 `/연금`, `/로또` 명령어 처리 |
| `/api/discord-register-commands?token=…` | 명령어 등록 (처음 한 번) |

- 역대 당첨번호는 `src/lottery/data/`에 들어 있어요 (로또 1~1244회, 146회 제외 / 연금 1~335회).
- 그 이후 회차는 실행할 때 동행복권에서 받아서 Netlify Blobs에 저장합니다.
- 동행복권에 접속이 안 되면, 가진 데이터로 번호를 뽑고 메시지에 경고를 붙여요.

## 설정

### 1. Netlify 사이트 만들기
[app.netlify.com](https://app.netlify.com) → **Add new project** → **Import an existing project** → GitHub → `lottery-bot` 선택 → 설정은 그대로 두고 배포.

### 2. 디스코드 웹훅 (월요일 알림용)
알림 받을 채널 → **채널 편집** → **연동** → **웹후크** → **새 웹후크** → **웹후크 URL 복사**.

### 3. 디스코드 앱 (명령어용)
[Developer Portal](https://discord.com/developers/applications) → **New Application**
- General Information에서 **Application ID**와 **Public Key** 복사
- Bot 탭에서 **Reset Token** → **Bot Token** 복사
- OAuth2 → URL Generator에서 `applications.commands` 체크 → 생성된 주소를 열어 내 서버 선택

### 4. Netlify 환경변수
사이트 → **Site configuration** (또는 Project configuration) → **Environment variables** → **Add a variable**

| Key | 값 |
|---|---|
| `DISCORD_WEBHOOK_URL` | 2번 웹훅 URL |
| `LOTTERY_TRIGGER_TOKEN` | 직접 정한 긴 비밀 문자열 |
| `DISCORD_APPLICATION_ID` | 3번 Application ID |
| `DISCORD_PUBLIC_KEY` | 3번 Public Key |
| `DISCORD_BOT_TOKEN` | 3번 Bot Token |
| `DISCORD_GUILD_ID` | (선택) 디스코드 설정 → 고급 → 개발자 모드 켜기 → 서버 우클릭 → 서버 ID 복사 |

다 넣었으면 **Deploys → Trigger deploy → Deploy site** 를 눌러 다시 배포하세요. 환경변수는 다음 배포부터 적용돼요.

### 5. 명령어 연결
1. 브라우저로 `https://<사이트주소>/api/discord-register-commands?token=<토큰>` 을 엽니다. "등록 완료"가 나오면 됩니다.
2. Developer Portal → General Information → **Interactions Endpoint URL** 에 `https://<사이트주소>/api/discord-interactions` 를 넣고 저장합니다.

### 6. 확인
- 디스코드에서 `/연금` 입력
- 알림 바로 받아보기: `curl -X POST "https://<사이트주소>/api/lottery-picks?token=<토큰>"`

## 개발

```bash
npm install
npm run lint   # 타입체크
npm test
```
