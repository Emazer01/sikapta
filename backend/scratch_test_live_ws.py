import asyncio
import json
import urllib.request
import websockets

async def test():
    req = urllib.request.Request(
        'http://127.0.0.1:8001/api/assessments/',
        data=json.dumps({
            'participant_id': 1,
            'camera_id': 1,
            'exercise_type': 'pushup',
            'model_used': 'yolo',
            'examiner_notes': 'Verification of Live WS Stream'
        }).encode('utf-8'),
        headers={'Content-Type': 'application/json'}
    )
    with urllib.request.urlopen(req) as response:
        session = json.loads(response.read().decode('utf-8'))
    
    session_id = session['id']
    print(f"Session created: ID={session_id}, Code={session['session_code']}")

    uri = f"ws://127.0.0.1:8001/ws/assessments/{session_id}/live"
    async with websockets.connect(uri) as ws:
        for i in range(5):
            msg = await ws.recv()
            data = json.loads(msg)
            print(f"Packet {i+1}: FPS={data['fps']}, Latency={data['latency_ms']}ms, FrameBytes={len(data.get('frame', ''))}, Form={data['is_good_form']}, Phase={data['phase']}")
    
    req_stop = urllib.request.Request(
        f"http://127.0.0.1:8001/api/assessments/{session_id}/control",
        data=json.dumps({'action': 'stop'}).encode('utf-8'),
        headers={'Content-Type': 'application/json'}
    )
    with urllib.request.urlopen(req_stop) as response:
        print("Session stopped cleanly.")

if __name__ == '__main__':
    asyncio.run(test())
