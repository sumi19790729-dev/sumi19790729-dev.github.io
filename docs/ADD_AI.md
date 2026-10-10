# AI 추가 방법

홈페이지 화면을 다시 만들지 말고 `data/tools.json`에 항목만 추가한다.

```json
{
  "id": "new-agent-id",
  "name": "새 Agentic AI 이름",
  "version": "v1.0",
  "status": "preparing",
  "url": null,
  "summary": "한 줄 소개",
  "features": ["기능 1", "기능 2"],
  "guide": "사용 안내"
}
```

- `status`: `preparing` (준비 중), `public` (공개), `private` (비공개)
- 실행 주소가 없으면 `url`을 `null`로 두고 `status`는 `preparing`으로 둔다. 임의의 URL을 만들지 않는다.
- 공개할 때만 `status`를 `public`으로 바꾸고 `url`에 실행 주소를 넣는다.
- AI 소스코드와 데이터는 이 저장소에 넣지 않는다. 별도 Private 저장소에서 관리한다.
