import { initializeApp } from "firebase/app"
import { getFirestore, collection, doc, setDoc, onSnapshot, updateDoc, addDoc, getDoc } from "firebase/firestore"
import { useState, useRef } from "react"

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API,
  authDomain: "videochat-mikgamer.firebaseapp.com",
  databaseURL: "https://videochat-mikgamer-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "videochat-mikgamer",
  storageBucket: "videochat-mikgamer.appspot.com"
}

const app = initializeApp(firebaseConfig)
const firestore = getFirestore()

let pc = null

let localStream = null,
    remoteStream = null

function App() {
  const [inCall, setCall] = useState(false),
        [webcamActive, setWebcam] = useState(false),
        [otherUser, setOtherUser] = useState(false),
        [timeout, setVideoTimeout] = useState(false),
        [badInput, setBadInput] = useState(false),
        localVideo = useRef(null),
        remoteVideo = useRef(null),
        callInput = useRef(null)

  const getLocalStream = async () => {
    pc = new RTCPeerConnection({iceServers:[{urls:["stun:stun1.l.google.com:19302","stun:stun2.l.google.com:19302"]}], iceCandidatePoolSize:10})
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
    remoteStream = new MediaStream()
    localStream.getTracks().forEach((track) => {pc.addTrack(track, localStream)})
    pc.ontrack = e => {e.streams[0].getTracks().forEach(track => {remoteStream.addTrack(track)})}
    pc.oniceconnectionstatechange = () => {if (pc.iceConnectionState == 'disconnected') {setVideoTimeout(true)} else setVideoTimeout(false)}

    localVideo.current.srcObject = localStream
    remoteVideo.current.srcObject = remoteStream
    setWebcam(true)
  }

  const createCall = async () => {
    const callDoc = doc(collection(firestore, 'calls'))
    const offerCandidates = collection(callDoc, 'offerCandidates')
    const answerCandidates = collection(callDoc, 'answerCandidates')
    callInput.current.value = callDoc.id

    pc.onicecandidate = e => {if (e.candidate) addDoc(offerCandidates,e.candidate.toJSON())}

    const offerDescription = await pc.createOffer()
    await pc.setLocalDescription(offerDescription)
    const offer = {sdp:offerDescription.sdp, type:offerDescription.type}
    await setDoc(callDoc, {offer})
  
    onSnapshot(callDoc, (snapshot) => {
      const data = snapshot.data()
      if (!pc.currentRemoteDescription && data?.answer) {
        const answerDescription = new RTCSessionDescription(data.answer)
        pc.setRemoteDescription(answerDescription)
      }
    })
    onSnapshot(answerCandidates, snapshot => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === "added") {
          const candidate = new RTCIceCandidate(change.doc.data())
          pc.addIceCandidate(candidate)
          setOtherUser(true)
        }
      })
    })

    setCall(true)
  }

  const answerCall = async () => {
    const callId = callInput.current.value
    if (!callId) {
      setBadInput(true)
      setTimeout(() => setBadInput(false), 5000)
      return
    }
    const callDoc = doc(firestore, 'calls', callId)
    const offerCandidates = collection(callDoc, 'offerCandidates')
    const answerCandidates = collection(callDoc, 'answerCandidates')

    pc.onicecandidate = e => {if (e.candidate) addDoc(answerCandidates, e.candidate.toJSON())}
  
    const callData = (await getDoc(callDoc)).data()
  
    try {
      const offerDescription = callData.offer
      await pc.setRemoteDescription(new RTCSessionDescription(offerDescription))
    }
    catch ( er ) {
      setBadInput(true)
      setTimeout(() => setBadInput(false), 5000)
      return
    }
    const answerDescription = await pc.createAnswer()
    await pc.setLocalDescription(answerDescription)

    const answer = {type:answerDescription.type, sdp:answerDescription.sdp}
    await updateDoc(callDoc, {answer})

    onSnapshot(offerCandidates, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          let data = change.doc.data()
          pc.addIceCandidate(new RTCIceCandidate(data))
          setOtherUser(true)
        }
      })
    })
    
    setCall(true)
  }

  const quitCall = async () => {
    pc.close()
    setCall(false)
    setWebcam(false)
    setVideoTimeout(false)
    setOtherUser(false)
    localVideo.current.srcObject.getTracks().forEach(track=>track.stop())
    localVideo.current.srcObject=null
    remoteVideo.current.srcObject.getTracks().forEach(track=>track.stop())
    remoteVideo.current.srcObject=null
    callInput.current.value = ""
  }

  return (
    <div className="App">
      <div className="videos">
        <div className={"video-container "+(webcamActive?"video-display":"")}>
          <video ref={localVideo} autoPlay playsInline muted/>
        </div>
        <div className={"video-container "+(timeout?"video-timeout ":"")+(otherUser?"video-display":"")}>
          <video ref={remoteVideo} autoPlay playsInline/>
        </div>
      </div>
      <div className="buttons-group">
        <p style={webcamActive?{display:"none"}:{}}>To use the Video Chat you first need to give access to your Webcam and Mic</p>
        <button onClick={()=>getLocalStream()} disabled={webcamActive}>Webcam</button>
        <p style={!webcamActive || inCall?{display:"none"}:{}}>Create a Video Chat or Connect to one</p>
        <button onClick={()=>createCall()} disabled={!webcamActive || inCall}>Create</button>
        <p style={!webcamActive || !inCall || otherUser?{display:"none"}:{}}>Copy the code and give it to your friend</p>
        <input ref={callInput} disabled={!webcamActive || otherUser} placeholder="Copy your code here" required/> 
        <p style={{display:!badInput?"none":"",color:"red"}}>Code Error, try another one or create your own Video Chat</p>
        <button onClick={()=>answerCall()} disabled={!webcamActive || inCall}>Connect</button>
        <button onClick={()=>quitCall()} disabled={!inCall}>Quit</button>
      </div>
    </div>
  )
}

export default App
