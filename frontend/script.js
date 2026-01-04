// ======================================
// CONFIG
// ======================================
const API_BASE = "http://127.0.0.1:8000";
let isTyping = false;

// ======================================
// SAFE MARKDOWN
// ======================================
function renderMarkdown(text) {
  if (window.marked) {
    return marked.parse(text);
  }
  return escapeHtml(text).replace(/\n/g, "<br>");
}

// ======================================
// MAKE UI VISIBLE
// ======================================
document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll("section").forEach(s => {
    s.classList.add("visible");
  });
  
  // Set initial session time
  updateSessionTime();
});

// ======================================
// DOM (SAFE)
// ======================================
const fileInput = document.getElementById("fileInput");
const uploadArea = document.getElementById("uploadArea");
const processingOverlay = document.getElementById("processingOverlay");
const progressFill = document.getElementById("progressFill");
const resultsContainer = document.getElementById("resultsContainer");
const summaryContent = document.getElementById("summaryContent");

const chatInput = document.getElementById("chatInput");
const sendButton = document.getElementById("sendButton");
const chatMessages = document.getElementById("chatMessages");

// ======================================
// FILE UPLOAD
// ======================================
if (fileInput) {
  fileInput.addEventListener("change", async () => {
    const file = fileInput.files[0];
    if (!file) return;

    uploadArea.style.display = "none";
    processingOverlay.style.display = "flex";
    progressFill.style.width = "30%";

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch(`${API_BASE}/upload`, {
        method: "POST",
        body: formData
      });

      const data = await res.json();
      progressFill.style.width = "100%";

      if (!res.ok) throw new Error();

      processingOverlay.style.display = "none";
      resultsContainer.style.display = "block";
      summaryContent.innerHTML = renderMarkdown(data.summary || "");

      chatInput.disabled = false;
      sendButton.disabled = false;
      updateSessionTime();

      addSystemMessage("📄 Document uploaded successfully");

    } catch {
      alert("Upload failed. Please try again.");
      resetUploadUI();
    }
  });
}

function resetUploadUI() {
  uploadArea.style.display = "block";
  processingOverlay.style.display = "none";
  resultsContainer.style.display = "none";
  progressFill.style.width = "0%";
}

// ======================================
// CHAT
// ======================================
if (sendButton && chatInput) {
  sendButton.addEventListener("click", sendMessage);
  chatInput.addEventListener("keydown", e => {
    if (e.key === "Enter") sendMessage();
  });
}

async function sendMessage() {
  const question = chatInput.value.trim();
  if (!question || isTyping) return;

  addUserMessage(question);
  chatInput.value = "";
  isTyping = true;
  sendButton.disabled = true;

  const aiBubble = createAIBubble();

  try {
    const res = await fetch(
      `${API_BASE}/ask?question=${encodeURIComponent(question)}`,
      { method: "POST" }
    );

    const data = await res.json();
    typeText(aiBubble, data.answer || "No response.");

  } catch {
    typeText(aiBubble, "❌ Error getting response");
  }
}

// ======================================
// QUICK PROMPTS
// ======================================
function sendQuickPrompt(prompt) {
  if (chatInput.disabled) {
    addSystemMessage("⚠️ Please upload a document first");
    return;
  }
  
  chatInput.value = prompt;
  sendMessage();
}

// ======================================
// CLEAR CHAT
// ======================================
function clearChat() {
  const welcomeMsg = document.querySelector('.welcome-message');
  chatMessages.innerHTML = '';
  if (welcomeMsg) {
    chatMessages.appendChild(welcomeMsg.cloneNode(true));
  }
  
  const chatInput = document.getElementById("chatInput");
  if (chatInput) {
    chatInput.value = "";
  }
  
  addSystemMessage("💬 Chat cleared");
}

// ======================================
// CHAT UI
// ======================================
function addUserMessage(text) {
  const div = document.createElement("div");
  div.className = "message-user";
  div.innerHTML = `<div class="message-bubble">${escapeHtml(text)}</div>`;
  chatMessages.appendChild(div);
  scrollBottom();
}

function createAIBubble() {
  const div = document.createElement("div");
  div.className = "message-ai";
  div.innerHTML = `
    <div class="ai-avatar"><i class="fas fa-robot"></i></div>
    <div class="message-bubble"></div>
  `;
  chatMessages.appendChild(div);
  scrollBottom();
  return div.querySelector(".message-bubble");
}

// ======================================
// LIGHT / DARK MODE TOGGLE
// ======================================
const themeToggleBtn = document.getElementById("themeToggle");

function applyTheme(theme) {
  document.body.classList.remove("dark-mode", "light-mode");
  if (theme === "dark") {
    document.body.classList.add("dark-mode");
  } else {
    document.body.classList.add("light-mode");
  }
  localStorage.setItem("theme", theme);
}

// Load saved theme
const savedTheme = localStorage.getItem("theme") || "dark";
applyTheme(savedTheme);
updateThemeIcon(savedTheme);

// Update theme icon based on current theme
function updateThemeIcon(theme) {
  if (!themeToggleBtn) return;
  
  const sunIcon = themeToggleBtn.querySelector('.fa-sun');
  const moonIcon = themeToggleBtn.querySelector('.fa-moon');
  
  if (theme === "dark") {
    sunIcon.style.opacity = "0";
    moonIcon.style.opacity = "1";
  } else {
    sunIcon.style.opacity = "1";
    moonIcon.style.opacity = "0";
  }
}

// Toggle on click
if (themeToggleBtn) {
  themeToggleBtn.addEventListener("click", () => {
    const isDark = document.body.classList.contains("dark-mode");
    const newTheme = isDark ? "light" : "dark";
    applyTheme(newTheme);
    updateThemeIcon(newTheme);
  });
}

// ======================================
// SESSION MANAGEMENT
// ======================================
function updateSessionTime() {
  const sessionTimeElement = document.getElementById("sessionTime");
  if (sessionTimeElement) {
    const now = new Date();
    const timeString = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    sessionTimeElement.textContent = timeString;
  }
}

// ======================================
// CHATGPT-LIKE TYPING EFFECT (STABLE)
// ======================================
function typeText(container, text) {
  let i = 0;
  container.innerHTML = "";

  const interval = setInterval(() => {
    container.textContent = text.slice(0, i);
    i++;
    scrollBottom();

    if (i > text.length) {
      clearInterval(interval);
      container.innerHTML = renderMarkdown(text);
      isTyping = false;
      sendButton.disabled = false;
    }
  }, 15);
}

// ======================================
// SYSTEM MESSAGE
// ======================================
function addSystemMessage(text) {
  const div = document.createElement("div");
  div.className = "message-ai";
  div.innerHTML = `
    <div class="ai-avatar"><i class="fas fa-info-circle"></i></div>
    <div class="message-bubble">${escapeHtml(text)}</div>
  `;
  chatMessages.appendChild(div);
  scrollBottom();
}

// ======================================
// HELPERS
// ======================================
function scrollBottom() {
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function escapeHtml(text) {
  const d = document.createElement("div");
  d.textContent = text;
  return d.innerHTML;
}

function scrollToSection(id) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
}

function startNewSession() {
  window.location.reload();
}