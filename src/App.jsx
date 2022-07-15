import { initializeApp } from "firebase/app"
import { getFirestore, collection, doc, setDoc, onSnapshot, updateDoc, addDoc, getDoc } from "firebase/firestore"
import { useRef } from "react"

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API,
  authDomain: "videochat-mikgamer.firebaseapp.com",
  databaseURL: "https://videochat-mikgamer-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "videochat-mikgamer",
  storageBucket: "videochat-mikgamer.appspot.com"
}

const app = initializeApp(firebaseConfig)
const firestore = getFirestore()

const servers = {
  iceServers: [{urls: ["stun:stun1.l.google.com:19302","stun:stun2.l.google.com:19302"]}],
  iceCandidatePoolSize: 10,
}
let pc = new RTCPeerConnection(servers)

let localStream = null
let remoteStream = null


function App() {
  const localVideo = useRef(null)
  const remoteVideo = useRef(null)
  const callInput = useRef(null)

  const getLocalStream = async () => {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
    localStream.getTracks().forEach((track) => {pc.addTrack(track, localStream)})
    localVideo.current.srcObject = localStream;
  }

  const createRemoteStream = () => {
    remoteStream = new MediaStream()
    pc.ontrack = e => {e.streams[0].getTracks().forEach(track => {remoteStream.addTrack(track)})}
    remoteVideo.srcObject = remoteStream
  }
  createRemoteStream()

  const createCall = async () => {
    const callDoc = doc(collection(firestore, 'calls'))
    const offerCandidates = collection(callDoc, 'offerCandidates')
    const answerCandidates = collection(callDoc, 'answerCandidates')
    callInput.current.value = callDoc.id
    
    pc.onicecandidate = e => {e.candidate && addDoc(offerCandidates,e.candidate.toJSON())}
  
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
        }
      })
    })
  }

  const answerCall = async () => {
    const callId = callInput.current.value
    const callDoc = doc(firestore, 'calls', callId)
    const offerCandidates = collection(callDoc, 'offerCandidates')
    const answerCandidates = collection(callDoc, 'answerCandidates')
  
    pc.onicecandidate = e => {e.candidate && addDoc(answerCandidates, e.candidate.toJSON())}
  
    const callData = (await getDoc(callDoc)).data()
  
    const offerDescription = callData.offer
    await pc.setRemoteDescription(new RTCSessionDescription(offerDescription))
  
    const answerDescription = await pc.createAnswer()
    await pc.setLocalDescription(answerDescription)
  
    const answer = {type:answerDescription.type, sdp:answerDescription.sdp}
  
    await updateDoc(callDoc, answer)

    onSnapshot(offerCandidates, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          let data = change.doc.data()
          pc.addIceCandidate(new RTCIceCandidate(data))
        }
      })
    })
  }

  return (
    <div className="App">
      <div className="videos">
        <video ref={localVideo} autoPlay playsInline />
        <video ref={remoteVideo} autoPlay playsInline />
      </div>
      <button onClick={()=>getLocalStream()}>Webcam</button>
      <button onClick={()=>createCall()}>Call</button>
      <input ref={callInput} />
      <button onClick={()=>answerCall()}>Answer</button>
      <button>Hangup</button>
    </div>
  )
}

export default App
