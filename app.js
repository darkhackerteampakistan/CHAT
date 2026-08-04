import { auth, db } from './firebase.js';
import { 
    createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut,
    onAuthStateChanged 
} from "firebase/auth";
import {
    collection, addDoc, query, orderBy, onSnapshot, doc, setDoc, getDoc,
    serverTimestamp
} from "firebase/firestore";

// DOM elements
const authContainer = document.getElementById('auth-container');
const chatApp = document.getElementById('chat-app');
const loginForm = document.getElementById('login-form');
const signupForm = document.getElementById('signup-form');
const loginTab = document.getElementById('login-tab');
const signupTab = document.getElementById('signup-tab');
const loginError = document.getElementById('login-error');
const signupError = document.getElementById('signup-error');
const messagesList = document.getElementById('messages-list');
const messageInput = document.getElementById('message-input');
const sendBtn = document.getElementById('send-btn');
const logoutBtn = document.getElementById('logout-btn');
const usernameDisplay = document.getElementById('username-display');
const emojiBtn = document.getElementById('emoji-btn');
const emojiPicker = document.getElementById('emoji-picker');

const GROUP_ID = "global_chat";
let currentUser = null;
let unsubscribeMessages = null;

// ---------- Emoji: add to input AND auto-send ----------
async function addEmojiAndSend(emoji) {
    if (!currentUser) return;
    // directly send the emoji as message
    const text = emoji.trim();
    if (!text) return;
    
    const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
    let displayName = currentUser.email.split('@')[0];
    if (userDoc.exists() && userDoc.data().displayName) displayName = userDoc.data().displayName;
    
    const messagesRef = collection(db, 'groups', GROUP_ID, 'messages');
    await addDoc(messagesRef, {
        text: text,
        senderId: currentUser.uid,
        senderName: displayName,
        timestamp: serverTimestamp()
    });
    // No need to clear input, just close picker
    emojiPicker.classList.add('hidden');
}

// Emoji picker toggle
emojiBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    emojiPicker.classList.toggle('hidden');
});

// Attach click to each emoji - auto send
document.querySelectorAll('#emoji-picker span').forEach(span => {
    span.addEventListener('click', async (e) => {
        e.stopPropagation();
        const emoji = span.innerText;
        await addEmojiAndSend(emoji);
    });
});

// Close emoji picker when clicking outside
document.addEventListener('click', (e) => {
    if (!emojiPicker.contains(e.target) && e.target !== emojiBtn) {
        emojiPicker.classList.add('hidden');
    }
});

// Auth Tabs
loginTab.addEventListener('click', () => {
    loginTab.classList.add('active');
    signupTab.classList.remove('active');
    loginForm.classList.add('active');
    signupForm.classList.remove('active');
});
signupTab.addEventListener('click', () => {
    signupTab.classList.add('active');
    loginTab.classList.remove('active');
    signupForm.classList.add('active');
    loginForm.classList.remove('active');
});

// Signup
signupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('signup-name').value.trim();
    const email = document.getElementById('signup-email').value.trim();
    const password = document.getElementById('signup-password').value;
    signupError.innerText = '';
    try {
        const userCred = await createUserWithEmailAndPassword(auth, email, password);
        await setDoc(doc(db, 'users', userCred.user.uid), {
            displayName: name,
            email: email,
            createdAt: serverTimestamp()
        });
    } catch (err) {
    console.error(err);
    alert(err.code + "\n" + err.message);
    signupError.innerText = err.code + " : " + err.message;
}
});

// Login
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    loginError.innerText = '';
    try {
        await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
        loginError.innerText = err.message;
    }
});

// Logout
logoutBtn.addEventListener('click', async () => {
    await signOut(auth);
});

// Real-time messages
async function loadMessages() {
    if (!currentUser) return;
    const messagesRef = collection(db, 'groups', GROUP_ID, 'messages');
    const q = query(messagesRef, orderBy('timestamp', 'asc'));
    unsubscribeMessages = onSnapshot(q, (snapshot) => {
        const msgs = [];
        snapshot.forEach(docSnap => {
            msgs.push({ id: docSnap.id, ...docSnap.data() });
        });
        renderMessages(msgs);
        autoScroll();
    });
}

function renderMessages(messages) {
    if (!messagesList) return;
    if (messages.length === 0) {
        messagesList.innerHTML = '<div class="empty-msg">✨ No messages yet. Say something!</div>';
        return;
    }
    messagesList.innerHTML = '';
    messages.forEach(msg => {
        const isOwn = msg.senderId === currentUser?.uid;
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${isOwn ? 'own' : 'other'}`;
        const senderName = msg.senderName || (isOwn ? 'You' : 'Someone');
        const time = msg.timestamp ? new Date(msg.timestamp.toDate()).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' }) : '';
        messageDiv.innerHTML = `
            <div class="message-sender">${escapeHtml(senderName)}</div>
            <div class="message-text">${escapeHtml(msg.text)}</div>
            <div class="message-time">${time}</div>
        `;
        messagesList.appendChild(messageDiv);
    });
}

function autoScroll() {
    const area = document.getElementById('messages-area');
    if (area) area.scrollTop = area.scrollHeight;
}

function escapeHtml(str) {
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

// Send text message
async function sendMessage() {
    const text = messageInput.value.trim();
    if (!text || !currentUser) return;
    
    const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
    let displayName = currentUser.email.split('@')[0];
    if (userDoc.exists() && userDoc.data().displayName) displayName = userDoc.data().displayName;
    
    const messagesRef = collection(db, 'groups', GROUP_ID, 'messages');
    await addDoc(messagesRef, {
        text: text,
        senderId: currentUser.uid,
        senderName: displayName,
        timestamp: serverTimestamp()
    });
    messageInput.value = '';
    messageInput.focus();
}

sendBtn.addEventListener('click', sendMessage);
messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});

// Auth state
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        authContainer.classList.add('hidden');
        chatApp.classList.remove('hidden');
        
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        let name = user.email.split('@')[0];
        if (userDoc.exists() && userDoc.data().displayName) name = userDoc.data().displayName;
        usernameDisplay.innerText = name;
        
        const groupRef = doc(db, 'groups', GROUP_ID);
        const groupSnap = await getDoc(groupRef);
        if (!groupSnap.exists()) {
            await setDoc(groupRef, {
                name: "Global Chat",
                createdAt: serverTimestamp()
            });
        }
        loadMessages();
    } else {
        if (unsubscribeMessages) unsubscribeMessages();
        currentUser = null;
        authContainer.classList.remove('hidden');
        chatApp.classList.add('hidden');
    }
});