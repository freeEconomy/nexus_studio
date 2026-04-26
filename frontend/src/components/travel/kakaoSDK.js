// Module-level singleton — safe across React StrictMode double-invocations
// and across multiple components (MapTab + MiniKakaoMap) sharing the same SDK.
const KAKAO_KEY = import.meta.env.VITE_KAKAO_MAP_KEY

let _sdkPromise = null

function toError(e) {
  if (e instanceof Error) return e
  if (typeof e === 'object' && e !== null) return new Error(JSON.stringify(e))
  return new Error(String(e))
}

export function loadKakaoSDK() {
  if (!KAKAO_KEY) return Promise.reject(new Error('VITE_KAKAO_MAP_KEY 미설정'))

  // Already fully initialized
  if (window.kakao?.maps?.LatLng) return Promise.resolve()

  // Return in-flight promise if SDK is currently loading
  if (_sdkPromise) return _sdkPromise

  _sdkPromise = new Promise((resolve, reject) => {
    let settled = false

    const done = () => {
      if (!settled) { settled = true; resolve() }
    }
    const fail = (e) => {
      if (!settled) { settled = true; _sdkPromise = null; reject(toError(e)) }
    }

    // kakao.maps.load() must be called explicitly (autoload=false).
    // Some SDK versions call the callback with an error argument on failure.
    // Add a 15s timeout in case the callback never fires.
    const runLoad = () => {
      const t = setTimeout(() => fail(new Error(
        'kakao.maps.load() 응답 없음 (15초)\n' +
        '① Kakao Developers → 내 애플리케이션 → 앱 키 → JavaScript 키 복사 여부 확인\n' +
        '② 플랫폼 → Web 플랫폼 등록 → http://localhost:5173 등록 여부 확인\n' +
        '③ 제품 설정 → 카카오맵 서비스 활성화 여부 확인'
      )), 15000)
      try {
        window.kakao.maps.load((err) => {
          clearTimeout(t)
          if (err) fail(err)
          else done()
        })
      } catch (e) {
        clearTimeout(t)
        fail(e)
      }
    }

    // kakao object already exists (script was loaded by a previous call)
    if (window.kakao) { runLoad(); return }

    // Script tag already in DOM but kakao not yet set — poll until it is
    if (document.getElementById('kakao-maps-sdk')) {
      let n = 0
      const poll = setInterval(() => {
        if (settled) { clearInterval(poll); return }
        if (window.kakao?.maps?.LatLng) { clearInterval(poll); done(); return }
        if (window.kakao) { clearInterval(poll); runLoad(); return }
        if (++n > 200) {
          clearInterval(poll)
          fail(new Error('window.kakao 로드 타임아웃 (10초) — 스크립트가 정상 로드되었는지 확인하세요'))
        }
      }, 50)
      return
    }

    // First load — inject script tag
    const s = document.createElement('script')
    s.id = 'kakao-maps-sdk'
    s.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${KAKAO_KEY}&autoload=false`
    s.onload = runLoad
    s.onerror = () => fail(new Error(
      'Kakao Maps SDK 스크립트 로드 실패\n네트워크 상태 또는 API 키를 확인하세요'
    ))
    document.head.appendChild(s)
  })

  return _sdkPromise
}

// Force-reinitialize: removes old script + window.kakao state so the next
// loadKakaoSDK() call starts completely fresh. Use after a failed attempt.
export function resetKakaoSDK() {
  _sdkPromise = null
  const existing = document.getElementById('kakao-maps-sdk')
  if (existing) existing.remove()
  try { delete window.kakao } catch (_) {}
}
