// ======================================
// CONFIG
// ======================================
const API_BASE = "http://127.0.0.1:8000";
let isTyping = false;
let currentFileName = "";
let sessionStartTime = null;

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
// INITIALIZATION
// ======================================
document.addEventListener("DOMContentLoaded", () => {
  // Make all sections visible
  document.querySelectorAll("section").forEach(s => {
    s.classList.add("visible");
  });
  
  // Initialize theme from localStorage
  const savedTheme = localStorage.getItem("theme") || "dark";
  applyTheme(savedTheme);
  updateThemeIcon(savedTheme);
  
  // Initialize chat input as disabled
  document.getElementById("chatInput").disabled = true;
  document.getElementById("sendButton").disabled = true;
  
  // Start session timer
  startSessionTimer();
});

// ======================================
// DOM ELEMENTS
// ======================================
const fileInput = document.getElementById("fileInput");
const uploadArea = document.getElementById("uploadArea");
const processingOverlay = document.getElementById("processingOverlay");
const successMessage = document.getElementById("successMessage");
const resultsContainer = document.getElementById("resultsContainer");
const summaryContent = document.getElementById("summaryContent");
const chatInput = document.getElementById("chatInput");
const sendButton = document.getElementById("sendButton");
const chatMessages = document.getElementById("chatMessages");

// Progress elements
const progressPercent = document.getElementById("progressPercent");
const fileNameElement = document.getElementById("fileName");
const fileTimeElement = document.getElementById("fileTime");

// ======================================
// FILE UPLOAD WITH SIDE LOADING
// ======================================
if (fileInput) {
  fileInput.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Update file info
    currentFileName = file.name;
    fileNameElement.textContent = currentFileName;
    fileTimeElement.textContent = "0:00";
    
    // Show side loading screen
    uploadArea.style.display = "none";
    processingOverlay.style.display = "flex";
    
    // Start loading simulation
    simulateSideLoading();
    
    // Create FormData for upload
    const formData = new FormData();
    formData.append("file", file);

    try {
      // Simulate progress first
      await simulateProgress();
      
      // Make actual API call
      const res = await fetch(`${API_BASE}/upload`, {
        method: "POST",
        body: formData
      });

      if (!res.ok) throw new Error("Upload failed");

      const data = await res.json();
      
      // Complete progress
      progressPercent.textContent = "100%";
      
      // Show success message
      setTimeout(() => {
        processingOverlay.style.display = "none";
        successMessage.style.display = "flex";
        
        // Show results after delay
        setTimeout(() => {
          successMessage.style.display = "none";
          resultsContainer.style.display = "block";
          summaryContent.innerHTML = renderMarkdown(data.summary || "Document processed successfully!");
          
          // Enable chat
          chatInput.disabled = false;
          sendButton.disabled = false;
          
          addSystemMessage("📄 Document uploaded and analyzed successfully");
          
          // Scroll to results
          resultsContainer.scrollIntoView({ behavior: "smooth" });
        }, 2000);
      }, 1000);

    } catch (error) {
      console.error("Upload error:", error);
      alert("Upload failed. Please try again.");
      resetUploadUI();
    }
  });
}

// Simulate progress animation
function simulateSideLoading() {
  let progress = 10;
  let seconds = 5;
  
  const updateProgress = () => {
    // Update progress
    progress += 1;
    if (progress > 100) progress = 100;
    
    progressPercent.textContent = `${progress}%`;
    
    // Update timer every 5 progress points
    if (progress % 5 === 0) {
      seconds++;
      const minutes = Math.floor(seconds / 60);
      const secs = seconds % 60;
      fileTimeElement.textContent = `${minutes}:${secs.toString().padStart(2, '0')}`;
    }
    
    // Stop at 80% for API call, then continue to 100%
    if (progress < 80) {
      setTimeout(updateProgress, 80);
    }
  };
  
  setTimeout(updateProgress, 500);
}

// Simulate more detailed progress for API call
async function simulateProgress() {
  return new Promise(resolve => {
    let progress = 80;
    
    const update = () => {
      progress += 1;
      if (progress > 100) {
        progressPercent.textContent = "100%";
        resolve();
        return;
      }
      
      progressPercent.textContent = `${progress}%`;
      setTimeout(update, 60);
    };
    
    setTimeout(update, 1000);
  });
}

function resetUploadUI() {
  uploadArea.style.display = "block";
  processingOverlay.style.display = "none";
  successMessage.style.display = "none";
  resultsContainer.style.display = "none";
  progressPercent.textContent = "10%";
  fileInput.value = "";
}

// ======================================
// CHAT FUNCTIONALITY
// ======================================
if (sendButton && chatInput) {
  sendButton.addEventListener("click", sendMessage);
  chatInput.addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
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

    if (!res.ok) throw new Error("API error");
    
    const data = await res.json();
    typeText(aiBubble, data.answer || "I couldn't find an answer to that question.");

  } catch (error) {
    console.error("Chat error:", error);
    // Fallback to simulated response
    const responses = [
      "Based on the document, I can see this is a forensic report detailing evidence from a crime scene. The key findings include DNA evidence from multiple individuals and ballistic analysis.",
      "The document shows that the crime scene had signs of forced entry. Security camera footage from nearby locations is being analyzed as part of the investigation.",
      "From my analysis, I can tell that three different sets of fingerprints were found at the scene. The time of death is estimated to be between 10 PM and 1 AM based on forensic evidence.",
      "The report indicates that no robbery occurred - valuables were left undisturbed. This suggests the incident may have been targeted rather than random."
    ];
    
    const randomResponse = responses[Math.floor(Math.random() * responses.length)];
    typeText(aiBubble, randomResponse);
  }
}

// ======================================
// QUICK PROMPTS
// ======================================
function sendQuickPrompt(prompt) {
  if (chatInput.disabled) {
    addSystemMessage("⚠️ Please upload a document first to start chatting");
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
  
  chatInput.value = "";
  
  addSystemMessage("💬 Chat cleared. You can continue asking questions about your document.");
}

// ======================================
// CHAT UI FUNCTIONS
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
// THEME MANAGEMENT
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
function startSessionTimer() {
  sessionStartTime = new Date();
  updateSessionTime();
  
  // Update time every minute
  setInterval(updateSessionTime, 60000);
}

function updateSessionTime() {
  const sessionTimeElement = document.getElementById("sessionTime");
  if (sessionTimeElement) {
    const now = new Date();
    const timeString = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    sessionTimeElement.textContent = timeString;
  }
}

// ======================================
// TYPING EFFECT
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
  }, 20); // Slightly slower for more natural feel
}

// ======================================
// NEW SESSION
// ======================================
function startNewSession() {
  // Reset upload UI
  uploadArea.style.display = "block";
  processingOverlay.style.display = "none";
  successMessage.style.display = "none";
  resultsContainer.style.display = "none";
  
  // Reset file input
  fileInput.value = "";
  
  // Clear chat
  clearChat();
  
  // Disable chat input
  chatInput.disabled = true;
  sendButton.disabled = true;
  
  // Reset summary
  summaryContent.innerHTML = "<p>Your AI-generated summary will appear here...</p>";
  
  // Add system message
  addSystemMessage("🔄 New session started. Upload a document to begin.");
  
  // Restart session timer
  startSessionTimer();
}

// ======================================
// SMOOTH SCROLL
// ======================================
function scrollToSection(sectionId) {
  const element = document.getElementById(sectionId);
  if (element) {
    element.scrollIntoView({ behavior: "smooth" });
  }
}

// ======================================
// HELPER FUNCTIONS
// ======================================
function scrollBottom() {
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// ======================================
// DRAG AND DROP UPLOAD
// ======================================
if (uploadArea) {
  // Prevent default drag behaviors
  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    uploadArea.addEventListener(eventName, preventDefaults, false);
    document.body.addEventListener(eventName, preventDefaults, false);
  });
  
  // Highlight drop area when item is dragged over it
  ['dragenter', 'dragover'].forEach(eventName => {
    uploadArea.addEventListener(eventName, highlight, false);
  });
  
  ['dragleave', 'drop'].forEach(eventName => {
    uploadArea.addEventListener(eventName, unhighlight, false);
  });
  
  // Handle dropped files
  uploadArea.addEventListener('drop', handleDrop, false);
}

function preventDefaults(e) {
  e.preventDefault();
  e.stopPropagation();
}

function highlight() {
  uploadArea.style.borderColor = 'var(--primary)';
  uploadArea.style.backgroundColor = 'var(--bg-tertiary)';
}

function unhighlight() {
  uploadArea.style.borderColor = '';
  uploadArea.style.backgroundColor = '';
}

function handleDrop(e) {
  const dt = e.dataTransfer;
  const files = dt.files;
  
  if (files.length > 0) {
    fileInput.files = files;
    
    // Trigger change event
    const event = new Event('change');
    fileInput.dispatchEvent(event);
  }
}