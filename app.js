(function () {
  const STORAGE_KEY = "wits_eventhub_gameon_2027_v2";

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        return Object.assign(structuredClone(window.INITIAL_PLATFORM_DATA), parsed);
      }
    } catch (e) {
      console.warn("Could not load state from localStorage:", e);
    }
    const fresh = structuredClone(window.INITIAL_PLATFORM_DATA);
    fresh.currentUser = {
      name: "Dr. Kabelo Mokoena",
      university: "University of the Witwatersrand (Wits)",
      role: "Delegate",
      initials: "KM",
      xp: 300,
      loggedIn: true
    };
    fresh.activeDayFilter = "ALL";
    fresh.activeUniFilter = "ALL";
    fresh.activeGDriveFolderFilter = "ALL";
    fresh.activeReviewAbstractId = fresh.abstracts[0]?.id || "ABS-2027-01";
    fresh.activeStreamRoomId = fresh.streamRooms[0]?.id || "room-plenary";
    fresh.pollVotes = [42, 31, 27];
    return fresh;
  }

  let state = loadState();

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.warn("Could not save state:", e);
    }
    updateHeaderCounters();
  }

  function showToast(message, icon = "🎲") {
    const container = document.getElementById("toastContainer");
    if (!container) return;
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.innerHTML = `<span>${icon}</span><span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translateY(8px)";
      toast.style.transition = "all 0.25s ease";
      setTimeout(() => toast.remove(), 260);
    }, 3800);
  }

  function addXP(points, reason) {
    state.currentUser.xp = (state.currentUser.xp || 0) + points;
    const userUni = state.currentUser.university || "University of the Witwatersrand (Wits)";
    const foundUni = state.universityLeaderboard.find(u =>
      u.university.toLowerCase().includes(userUni.toLowerCase().split(" ")[0]) ||
      userUni.toLowerCase().includes(u.university.toLowerCase().split(" ")[0])
    );
    if (foundUni) {
      foundUni.points += points;
    } else {
      state.universityLeaderboard[0].points += points;
    }
    state.universityLeaderboard.sort((a, b) => b.points - a.points);
    saveState();
    renderGamification();
    showToast(`+${points} XP · ${reason}`, "⚡");
  }

  function updateHeaderCounters() {
    const xpEl = document.getElementById("headerUserXP");
    const gameXpEl = document.getElementById("gamificationUserXP");
    if (xpEl) xpEl.textContent = `${state.currentUser.xp} XP`;
    if (gameXpEl) gameXpEl.textContent = `${state.currentUser.xp} XP`;

    const initEl = document.getElementById("headerUserInitials");
    const nameEl = document.getElementById("headerUserName");
    if (initEl && nameEl) {
      if (state.currentUser.loggedIn) {
        initEl.textContent = state.currentUser.initials;
        nameEl.textContent = `${state.currentUser.name} · ${state.currentUser.role}`;
      } else {
        initEl.textContent = "GO";
        nameEl.textContent = "Participant Login / Register";
      }
    }

    const navAgenda = document.getElementById("navAgendaCount");
    const navSpeaker = document.getElementById("navSpeakerCount");
    const navAbstract = document.getElementById("navAbstractCount");
    const savedCount = document.getElementById("savedAgendaCount");
    const absCount = document.getElementById("submittedAbstractsCount");
    const topGDriveCount = document.getElementById("topGDriveFileCount");

    if (navAgenda) navAgenda.textContent = state.sessions.length;
    if (navSpeaker) navSpeaker.textContent = state.speakers.length;
    if (navAbstract) navAbstract.textContent = state.abstracts.length;
    if (savedCount) savedCount.textContent = state.sessions.filter(s => s.saved).length;
    if (absCount) absCount.textContent = state.abstracts.length;
    if (topGDriveCount) topGDriveCount.textContent = state.googleDriveFiles.length;
  }

  // ==========================================
  // NAVIGATION & TAB SWITCHING
  // ==========================================
  function switchTab(tabId) {
    document.querySelectorAll(".nav-tab").forEach(btn => {
      btn.classList.toggle("active", btn.dataset.tab === tabId);
    });
    document.querySelectorAll(".tab-panel").forEach(panel => {
      panel.classList.toggle("active", panel.id === `tab-${tabId}`);
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  document.querySelectorAll(".nav-tab").forEach(btn => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });

  document.querySelectorAll("[data-goto-tab]").forEach(el => {
    el.addEventListener("click", () => switchTab(el.dataset.gotoTab));
  });

  // ==========================================
  // GOOGLE DRIVE MULTI-FOLDER ROUTING ENGINE
  // ==========================================
  function getTrackDriveFolderId(trackNumber) {
    const map = {
      "TRACK 1": "gdrive-abs-t1",
      "TRACK 2": "gdrive-abs-t2",
      "TRACK 3": "gdrive-abs-t3",
      "TRACK 4": "gdrive-abs-t4"
    };
    return map[trackNumber] || "gdrive-abs-t1";
  }

  function formatBytes(bytes) {
    if (!bytes || isNaN(bytes)) return "420 KB";
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / 1048576).toFixed(1) + " MB";
  }

  function routeFileToGoogleDrive({ fileObj, fallbackFileName, folderId, fileType, uploadedBy }) {
    const folder = state.googleDriveFolders.find(f => f.id === folderId) || state.googleDriveFolders[0];
    const fileName = (fileObj?.name || fallbackFileName || "Symposium_Upload_2027.pdf").replace(/\s+/g, "_");
    const sizeLabel = fileObj ? formatBytes(fileObj.size) : "580 KB";
    const nowStr = new Date().toISOString().slice(0, 16).replace("T", " ");
    const drivePath = `${folder.path}${fileName}`;

    const newEntry = {
      id: "file-" + Date.now() + "-" + Math.floor(Math.random() * 1000),
      folderId: folder.id,
      fileName,
      fileType,
      uploadedBy,
      uploadedAt: nowStr,
      sizeLabel,
      drivePath,
      syncStatus: state.googleDriveConfig?.appsScriptWebhookUrl
        ? "Synced to Live Google Drive Webhook"
        : "Routed to Google Drive Folder",
      dataUrl: null
    };

    if (fileObj && fileObj.size <= 3 * 1024 * 1024) {
      const reader = new FileReader();
      reader.onload = function (evt) {
        newEntry.dataUrl = evt.target.result;
        // If organizer configured a live Google Apps Script Webhook, POST to Google Drive
        if (state.googleDriveConfig?.appsScriptWebhookUrl) {
          const base64Data = String(evt.target.result).split(",")[1] || "";
          fetch(state.googleDriveConfig.appsScriptWebhookUrl, {
            method: "POST",
            mode: "no-cors",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              subfolder: folder.name,
              fileName,
              mimeType: fileObj.type || "application/octet-stream",
              base64Data
            })
          }).catch(() => {});
        }
        saveState();
      };
      reader.readAsDataURL(fileObj);
    }

    state.googleDriveFiles.unshift(newEntry);
    saveState();
    renderGoogleDriveExplorer();
    return newEntry;
  }

  function renderGoogleDriveExplorer() {
    const foldersGrid = document.getElementById("gdriveFoldersGrid");
    const filesList = document.getElementById("gdriveFilesList");
    const directSelect = document.getElementById("directGDriveFolderSelect");
    const headingEl = document.getElementById("activeGDriveFolderHeading");

    if (directSelect && directSelect.options.length === 0) {
      directSelect.innerHTML = state.googleDriveFolders
        .map(f => `<option value="${f.id}">${f.icon} ${f.name}</option>`)
        .join("");
    }

    if (foldersGrid) {
      foldersGrid.innerHTML = state.googleDriveFolders
        .map(folder => {
          const count = state.googleDriveFiles.filter(f => f.folderId === folder.id).length;
          const isActive = state.activeGDriveFolderFilter === folder.id;
          return `
          <div class="gdrive-folder-tab ${isActive ? "active" : ""}" data-folder-id="${folder.id}">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span style="font-size:1.35rem;">${folder.icon}</span>
              <span class="badge ${count > 0 ? "badge-teal" : "badge-mustard"}">${count} file${count === 1 ? "" : "s"}</span>
            </div>
            <div style="font-family:var(--font-display); font-weight:700; font-size:0.92rem; color:var(--ink-espresso); margin-top:0.2rem;">
              ${folder.name}
            </div>
            <div style="font-size:0.73rem; color:var(--ink-muted); font-family:ui-monospace, monospace; word-break:break-all;">
              ${folder.path}
            </div>
          </div>
        `;
        })
        .join("");

      foldersGrid.querySelectorAll(".gdrive-folder-tab").forEach(tab => {
        tab.addEventListener("click", () => {
          state.activeGDriveFolderFilter = tab.dataset.folderId;
          renderGoogleDriveExplorer();
        });
      });
    }

    if (filesList) {
      const filteredFiles =
        state.activeGDriveFolderFilter === "ALL"
          ? state.googleDriveFiles
          : state.googleDriveFiles.filter(f => f.folderId === state.activeGDriveFolderFilter);

      if (headingEl) {
        if (state.activeGDriveFolderFilter === "ALL") {
          headingEl.textContent = `📂 All Categorized Google Drive Files (${state.googleDriveFiles.length})`;
        } else {
          const activeF = state.googleDriveFolders.find(f => f.id === state.activeGDriveFolderFilter);
          headingEl.textContent = `${activeF?.icon || "📁"} Folder: ${activeF?.path || ""} (${filteredFiles.length} files)`;
        }
      }

      if (filteredFiles.length === 0) {
        filesList.innerHTML = `
          <div style="text-align:center; padding:1.2rem; font-size:0.85rem; color:var(--ink-muted);">
            No files in this Google Drive subfolder yet. Upload an abstract, presentation, or game build above!
          </div>
        `;
      } else {
        filesList.innerHTML = filteredFiles
          .map(
            file => `
          <div class="gdrive-file-row">
            <div>
              <div style="display:flex; align-items:center; gap:0.5rem; flex-wrap:wrap;">
                <strong style="font-size:0.9rem; color:var(--ink-espresso);">📄 ${file.fileName}</strong>
                <span class="badge badge-teal">${file.fileType}</span>
                <span class="badge badge-mustard">${file.sizeLabel}</span>
              </div>
              <div style="font-size:0.75rem; color:var(--ink-muted); margin-top:0.2rem;">
                Uploaded by <strong>${file.uploadedBy}</strong> (${file.uploadedAt}) · Drive Path: <code>${file.drivePath}</code>
              </div>
            </div>
            <div style="display:flex; gap:0.45rem; align-items:center;">
              <button class="btn btn-outline btn-sm download-gdrive-file-btn" data-id="${file.id}">📥 Download File</button>
            </div>
          </div>
        `
          )
          .join("");

        filesList.querySelectorAll(".download-gdrive-file-btn").forEach(btn => {
          btn.addEventListener("click", () => {
            const f = state.googleDriveFiles.find(item => item.id === btn.dataset.id);
            if (!f) return;
            if (f.dataUrl) {
              const a = document.createElement("a");
              a.href = f.dataUrl;
              a.download = f.fileName;
              a.click();
            } else {
              // Generate a summary receipt download for pre-populated demo files
              const content = `EventHub · Wits University Google Drive File Record\nFile: ${f.fileName}\nFolder Path: ${f.drivePath}\nUploaded By: ${f.uploadedBy}\nTimestamp: ${f.uploadedAt}\nStatus: ${f.syncStatus}\n`;
              const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = f.fileName + ".txt";
              a.click();
              URL.revokeObjectURL(url);
            }
            showToast(`Downloaded "${f.fileName}" from ${f.drivePath}`, "☁️");
          });
        });
      }
    }

    const extBtn = document.getElementById("openExternalGDriveBtn");
    if (extBtn && state.googleDriveConfig?.rootFolderUrl) {
      extBtn.href = state.googleDriveConfig.rootFolderUrl;
    }
  }

  document.getElementById("showAllGDriveFilesBtn")?.addEventListener("click", () => {
    state.activeGDriveFolderFilter = "ALL";
    renderGoogleDriveExplorer();
  });

  document.getElementById("openGDriveDirectUploadBtn")?.addEventListener("click", () => {
    const drawer = document.getElementById("directGDriveUploadDrawer");
    if (drawer) drawer.style.display = drawer.style.display === "none" ? "block" : "none";
  });

  document.getElementById("directGDriveUploadForm")?.addEventListener("submit", e => {
    e.preventDefault();
    const folderId = document.getElementById("directGDriveFolderSelect").value;
    const uploader = document.getElementById("directGDriveUploader").value.trim();
    const fileInput = document.getElementById("directGDriveFileInput");
    const fileObj = fileInput?.files?.[0];
    if (!fileObj) return;

    const folder = state.googleDriveFolders.find(f => f.id === folderId);
    routeFileToGoogleDrive({
      fileObj,
      fallbackFileName: fileObj.name,
      folderId,
      fileType: folder?.category || "Direct Folder Upload",
      uploadedBy: uploader
    });

    state.activeGDriveFolderFilter = folderId;
    renderGoogleDriveExplorer();
    e.target.reset();
    document.getElementById("directGDriveUploadDrawer").style.display = "none";
    addXP(40, `Uploaded "${fileObj.name}" directly to Google Drive folder ${folder?.name}`);
  });

  // Google Drive Config Modal
  document.getElementById("openGDriveConfigModalBtn")?.addEventListener("click", () => {
    document.getElementById("gdriveRootUrlInput").value = state.googleDriveConfig?.rootFolderUrl || "";
    document.getElementById("gdriveWebhookUrlInput").value = state.googleDriveConfig?.appsScriptWebhookUrl || "";
    document.getElementById("gdriveConfigModal")?.classList.add("open");
  });

  document.getElementById("openGDriveModalFromTabBtn")?.addEventListener("click", () => {
    document.getElementById("gdriveRootUrlInput").value = state.googleDriveConfig?.rootFolderUrl || "";
    document.getElementById("gdriveWebhookUrlInput").value = state.googleDriveConfig?.appsScriptWebhookUrl || "";
    document.getElementById("gdriveConfigModal")?.classList.add("open");
  });

  document.getElementById("jumpToGDriveExplorerBtn")?.addEventListener("click", () => {
    document.getElementById("gdriveConfigModal")?.classList.remove("open");
    switchTab("abstracts");
    setTimeout(() => {
      document.getElementById("gdriveExplorerSection")?.scrollIntoView({ behavior: "smooth" });
    }, 120);
  });

  document.getElementById("gdriveConfigForm")?.addEventListener("submit", e => {
    e.preventDefault();
    state.googleDriveConfig.rootFolderUrl =
      document.getElementById("gdriveRootUrlInput").value.trim() || "https://drive.google.com/drive/u/0/my-drive";
    state.googleDriveConfig.appsScriptWebhookUrl = document.getElementById("gdriveWebhookUrlInput").value.trim();
    saveState();
    renderGoogleDriveExplorer();
    document.getElementById("gdriveConfigModal")?.classList.remove("open");
    showToast("Saved Google Drive multi-folder routing & sync settings!", "☁️");
  });

  // ==========================================
  // UNIVERSITY MULTI-EVENT SUBDOMAIN BAR
  // ==========================================
  function renderUniversityEventsBar() {
    const select = document.getElementById("eventSwitcherSelect");
    const subdomainText = document.getElementById("subdomainText");
    if (!select) return;

    select.innerHTML = state.universityEvents
      .map(
        ev =>
          `<option value="${ev.id}" ${ev.subdomain === state.activeSubdomain ? "selected" : ""}>
            ${ev.title} (${ev.subdomain})
          </option>`
      )
      .join("");

    if (subdomainText) subdomainText.textContent = state.activeSubdomain;
  }

  document.getElementById("eventSwitcherSelect")?.addEventListener("change", e => {
    const chosen = state.universityEvents.find(ev => ev.id === e.target.value);
    if (chosen) {
      state.activeSubdomain = chosen.subdomain;
      saveState();
      renderUniversityEventsBar();
      showToast(`Switched active EventHub subdomain to ${chosen.subdomain} (${chosen.title})`, "🏛️");
    }
  });

  // ==========================================
  // COUNTDOWN TIMER TO 11 MARCH 2027 08:30 SAST
  // ==========================================
  function updateCountdown() {
    const target = new Date("2027-03-11T08:30:00+02:00").getTime();
    const now = Date.now();
    const diff = Math.max(0, target - now);

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
    const mins = Math.floor((diff / (1000 * 60)) % 60);
    const secs = Math.floor((diff / 1000) % 60);

    const dEl = document.getElementById("cdDays");
    const hEl = document.getElementById("cdHours");
    const mEl = document.getElementById("cdMins");
    const sEl = document.getElementById("cdSecs");

    if (dEl) dEl.textContent = String(days).padStart(2, "0");
    if (hEl) hEl.textContent = String(hours).padStart(2, "0");
    if (mEl) mEl.textContent = String(mins).padStart(2, "0");
    if (sEl) sEl.textContent = String(secs).padStart(2, "0");
  }
  setInterval(updateCountdown, 1000);
  updateCountdown();

  // ==========================================
  // TAB 1: RENDER 4 OFFICIAL SYMPOSIUM TRACKS
  // ==========================================
  function renderOverviewTracks() {
    const container = document.getElementById("overviewTracksContainer");
    if (!container) return;

    container.innerHTML = state.tracks
      .map(
        t => `
      <div class="track-card ${t.colorClass}">
        <div class="track-badge">${t.number}</div>
        <h3 class="track-title">${t.title}</h3>
        <p class="track-desc">${t.subtitle}</p>
        <div style="font-size:0.75rem; font-weight:800; text-transform:uppercase; margin-bottom:0.45rem; color:var(--ink-espresso);">
          Topics May Include (Click to Submit Abstract):
        </div>
        <div class="track-topics">
          ${t.topics
            .map(
              topic =>
                `<button type="button" class="topic-pill track-topic-jump" data-track="${t.number}" data-topic="${topic}" style="cursor:pointer;">
                  • ${topic}
                </button>`
            )
            .join("")}
        </div>
      </div>
    `
      )
      .join("");

    container.querySelectorAll(".track-topic-jump").forEach(btn => {
      btn.addEventListener("click", () => {
        const trackVal = btn.dataset.track;
        const topicVal = btn.dataset.topic;
        switchTab("abstracts");
        const trackSelect = document.getElementById("absTrackSelect");
        if (trackSelect) {
          trackSelect.value = trackVal;
          populateSubTopicsDropdown(trackVal, topicVal);
        }
        document.getElementById("absTitle")?.focus();
        showToast(`Pre-selected ${trackVal}: "${topicVal}"`, "🎯");
      });
    });
  }

  // ==========================================
  // TAB 2: AGENDA & PERSONAL CALENDAR
  // ==========================================
  function renderAgenda() {
    const container = document.getElementById("agendaSessionsContainer");
    if (!container) return;

    const trackFilter = document.getElementById("agendaTrackFilter")?.value || "ALL";
    const query = (document.getElementById("agendaSearchInput")?.value || "").toLowerCase().trim();

    const filtered = state.sessions.filter(sess => {
      if (state.activeDayFilter === "Day 1" && !sess.day.includes("Day 1")) return false;
      if (state.activeDayFilter === "Day 2" && !sess.day.includes("Day 2")) return false;
      if (state.activeDayFilter === "SAVED" && !sess.saved) return false;
      if (trackFilter !== "ALL" && sess.track !== trackFilter) return false;
      if (query) {
        const hay = `${sess.title} ${sess.speaker} ${sess.university} ${sess.description} ${sess.room}`.toLowerCase();
        if (!hay.includes(query)) return false;
      }
      return true;
    });

    if (filtered.length === 0) {
      container.innerHTML = `
        <div class="card" style="text-align:center; padding:2rem;">
          <h3 style="font-family:var(--font-display);">No sessions match your current filter</h3>
          <p style="font-size:0.88rem; color:var(--ink-muted); margin-top:0.35rem;">Try clearing your search or switching back to "All Days".</p>
        </div>
      `;
      return;
    }

    container.innerHTML = filtered
      .map(
        sess => `
      <div class="session-card">
        <div class="session-time-col">
          <div class="session-day-tag">${sess.day}</div>
          <div class="session-time">${sess.startTime} – ${sess.endTime}</div>
          <span class="session-room-tag">📡 ${sess.streamPlatform}</span>
        </div>

        <div>
          <div class="session-tags">
            <span class="badge badge-teal">${sess.track}</span>
            <span class="badge badge-mustard">📍 ${sess.room}</span>
            <span class="badge badge-navy">🏛️ ${sess.university}</span>
          </div>
          <h3 style="font-family:var(--font-display); font-size:1.18rem; margin-bottom:0.3rem;">${sess.title}</h3>
          <div style="font-size:0.84rem; font-weight:700; color:var(--terracotta-dark); margin-bottom:0.4rem;">
            🎤 ${sess.speaker}
          </div>
          <p style="font-size:0.86rem; color:var(--ink-brown);">${sess.description}</p>
        </div>

        <div style="display:flex; flex-direction:column; gap:0.5rem; min-width:165px;">
          <button class="btn ${sess.saved ? "btn-mustard" : "btn-outline"} btn-sm toggle-save-session" data-id="${sess.id}">
            ${sess.saved ? "⭐ Saved in My Agenda" : "☆ Add to My Agenda"}
          </button>
          <button class="btn btn-primary btn-sm join-session-stream" data-id="${sess.id}">
            🎥 Join Hybrid Room
          </button>
        </div>
      </div>
    `
      )
      .join("");

    container.querySelectorAll(".toggle-save-session").forEach(btn => {
      btn.addEventListener("click", () => {
        const s = state.sessions.find(item => item.id === btn.dataset.id);
        if (s) {
          s.saved = !s.saved;
          saveState();
          renderAgenda();
          showToast(
            s.saved ? `Added "${s.title.slice(0, 38)}..." to your personal agenda!` : "Removed from personal agenda",
            s.saved ? "⭐" : "📅"
          );
        }
      });
    });

    container.querySelectorAll(".join-session-stream").forEach(btn => {
      btn.addEventListener("click", () => {
        switchTab("stream");
        showToast("Entered Hybrid Live Stream Stage (Zoom / MS Teams)", "📡");
      });
    });
  }

  document.querySelectorAll("#agendaDayFilters .chip-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#agendaDayFilters .chip-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      state.activeDayFilter = btn.dataset.day;
      renderAgenda();
    });
  });

  document.getElementById("agendaTrackFilter")?.addEventListener("change", renderAgenda);
  document.getElementById("agendaSearchInput")?.addEventListener("input", renderAgenda);

  // Export .ICS Calendar File
  document.getElementById("exportIcsBtn")?.addEventListener("click", () => {
    const savedSessions = state.sessions.filter(s => s.saved);
    const listToExport = savedSessions.length ? savedSessions : state.sessions;

    const lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Wits University eFundanathi eZone//GO Game-On Symposium 2027//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH"
    ];

    listToExport.forEach(sess => {
      const datePrefix = sess.day.includes("Day 2") ? "20270312" : "20270311";
      const startClean = (sess.startTime || "09:00").replace(":", "") + "00";
      const endClean = (sess.endTime || "10:00").replace(":", "") + "00";
      lines.push(
        "BEGIN:VEVENT",
        `UID:${sess.id}@gameon2027.eventhub.wits.ac.za`,
        `DTSTAMP:20261111T090000Z`,
        `DTSTART:${datePrefix}T${startClean}`,
        `DTEND:${datePrefix}T${endClean}`,
        `SUMMARY:${sess.title.replace(/,/g, "\\,")}`,
        `LOCATION:${sess.room.replace(/,/g, "\\,")} (eFundanathi eZone, Wits Education Campus)`,
        `DESCRIPTION:Speaker: ${sess.speaker} (${sess.university}) - Stream: ${sess.streamPlatform}`,
        "END:VEVENT"
      );
    });

    lines.push("END:VCALENDAR");
    const blob = new Blob([lines.join("\r\n")], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "GO_Game_On_Symposium_2027_Agenda.ics";
    a.click();
    URL.revokeObjectURL(url);
    showToast(`Exported ${listToExport.length} sessions to GO_Game_On_Symposium_2027_Agenda.ics!`, "📥");
  });

  // Add New Session Modal
  document.getElementById("openAddSessionModalBtn")?.addEventListener("click", () => {
    document.getElementById("addSessionModal")?.classList.add("open");
  });

  document.getElementById("addSessionForm")?.addEventListener("submit", e => {
    e.preventDefault();
    const timeRaw = document.getElementById("newSessTime").value.split("-");
    const newSession = {
      id: "sess-" + Date.now(),
      day: document.getElementById("newSessDay").value,
      startTime: (timeRaw[0] || "11:30").trim(),
      endTime: (timeRaw[1] || "12:30").trim(),
      title: document.getElementById("newSessTitle").value.trim(),
      track: document.getElementById("newSessTrack").value,
      format: "Hybrid Session",
      room: "eFundanathi eZone Seminar Pod & Online",
      streamPlatform: document.getElementById("newSessStream").value,
      speaker: document.getElementById("newSessSpeaker").value.trim(),
      university: document.getElementById("newSessUni").value.trim(),
      description: document.getElementById("newSessDesc").value.trim(),
      saved: true
    };
    state.sessions.push(newSession);
    saveState();
    renderAgenda();
    e.target.reset();
    document.getElementById("addSessionModal")?.classList.remove("open");
    showToast(`Added "${newSession.title}" to Symposium Calendar!`, "📅");
  });

  // ==========================================
  // TAB 3: SPEAKERS, BIOS & INTER-UNIVERSITY HUB
  // ==========================================
  function renderSpeakers() {
    const container = document.getElementById("speakersDirectoryContainer");
    if (!container) return;

    const query = (document.getElementById("speakerSearchInput")?.value || "").toLowerCase().trim();

    const filtered = state.speakers.filter(sp => {
      if (state.activeUniFilter !== "ALL") {
        if (!sp.university.toLowerCase().includes(state.activeUniFilter.toLowerCase())) return false;
      }
      if (query) {
        const hay = `${sp.name} ${sp.university} ${sp.department} ${sp.bio} ${sp.sessionTitle} ${(sp.interests || []).join(" ")}`.toLowerCase();
        if (!hay.includes(query)) return false;
      }
      return true;
    });

    container.innerHTML = filtered
      .map(
        sp => `
      <div class="speaker-card">
        <div class="speaker-top">
          <div class="speaker-avatar" style="background:${sp.avatarBg || "#17787e"};">${sp.initials}</div>
          <div>
            <span class="badge badge-mustard" style="margin-bottom:0.2rem;">${sp.role} · ${sp.track}</span>
            <h3 style="font-family:var(--font-display); font-size:1.15rem; line-height:1.2;">${sp.name}</h3>
            <div style="font-size:0.78rem; color:var(--ink-muted); font-weight:600;">${sp.title}</div>
            <span class="uni-pill">🏛️ ${sp.university}</span>
          </div>
        </div>

        <p style="font-size:0.84rem; color:var(--ink-brown); flex:1;">${sp.bio}</p>

        <div style="background:var(--bg-cream); border:1.5px solid #e4d9c5; border-radius:10px; padding:0.6rem 0.75rem; font-size:0.79rem;">
          <strong>🎤 Session / Focus:</strong> ${sp.sessionTitle || "Symposium Panel & Networking"}
          ${
            sp.presentationFile
              ? `<div style="margin-top:0.25rem; color:var(--teal-dark); font-weight:700;">☁️ Drive File: ${sp.presentationFile}</div>`
              : ""
          }
        </div>

        <div class="track-topics">
          ${(sp.interests || []).map(tag => `<span class="topic-pill">#${tag}</span>`).join("")}
        </div>

        <div style="display:flex; gap:0.5rem;">
          <button class="btn btn-outline btn-sm connect-speaker-btn" data-name="${sp.name}" data-uni="${sp.university}" style="flex:1;">
            🤝 Connect / Meetup
          </button>
          ${
            sp.presentationFile
              ? `<button class="btn btn-primary btn-sm download-speaker-deck" data-file="${sp.presentationFile}" data-name="${sp.name}">
                  📥 Slides
                </button>`
              : ""
          }
        </div>
      </div>
    `
      )
      .join("");

    container.querySelectorAll(".connect-speaker-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        addXP(25, `Sent Inter-University Meetup invite to ${btn.dataset.name} (${btn.dataset.uni})`);
      });
    });

    container.querySelectorAll(".download-speaker-deck").forEach(btn => {
      btn.addEventListener("click", () => {
        showToast(`Downloading "${btn.dataset.file}" from Google Drive folder /02_Speaker_Presentations_&_Slide_Decks/...`, "☁️");
      });
    });
  }

  document.querySelectorAll("#speakerUniFilters .chip-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#speakerUniFilters .chip-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      state.activeUniFilter = btn.dataset.uni;
      renderSpeakers();
    });
  });

  document.getElementById("speakerSearchInput")?.addEventListener("input", renderSpeakers);

  document.getElementById("toggleBioCreatorBtn")?.addEventListener("click", () => {
    const card = document.getElementById("bioCreatorCard");
    if (card) {
      card.style.display = card.style.display === "none" ? "block" : "none";
    }
  });

  document.getElementById("cancelBioBtn")?.addEventListener("click", () => {
    const card = document.getElementById("bioCreatorCard");
    if (card) card.style.display = "none";
  });

  document.getElementById("speakerBioForm")?.addEventListener("submit", e => {
    e.preventDefault();
    const name = document.getElementById("bioName").value.trim();
    const uni = document.getElementById("bioUniversity").value.trim();
    const dept = document.getElementById("bioDept").value.trim();
    const role = document.getElementById("bioRole").value;
    const track = document.getElementById("bioTrack").value;
    const sessionTitle = document.getElementById("bioSessionTitle").value.trim() || "Inter-University Research & Playtest Exchange";
    const bio = document.getElementById("bioText").value.trim();
    const tagsRaw = document.getElementById("bioTags").value.trim();
    const fileInput = document.getElementById("bioPresentationFile");
    const fileObj = fileInput?.files?.[0];
    const fileName = fileObj?.name || `${name.replace(/\s+/g, "_")}_Presentation_2027.pdf`;

    const words = name.replace(/^(Dr\.|Prof\.|Mr\.|Ms\.|Mrs\.)\s*/i, "").split(" ");
    const initials = ((words[0]?.[0] || "U") + (words[1]?.[0] || "D")).toUpperCase();
    const colors = ["#17787e", "#d86838", "#2f3b59", "#1f8a5b", "#c48e1a"];

    const newSpeaker = {
      id: "spk-" + Date.now(),
      name,
      role,
      title: dept,
      university: uni,
      department: dept,
      track,
      avatarBg: colors[state.speakers.length % colors.length],
      initials,
      bio,
      sessionTitle,
      presentationFile: fileName,
      gdriveFolder: "02_Speaker_Presentations_&_Slide_Decks",
      interests: tagsRaw ? tagsRaw.split(",").map(s => s.trim()).filter(Boolean) : ["Playful Pedagogy", "Game-On 2027"]
    };

    // Route Bio PDF record to 03_Speaker_&_Participant_Bios_&_Photos
    routeFileToGoogleDrive({
      fileObj: null,
      fallbackFileName: `Bio_${name.replace(/\s+/g, "_")}_${uni.slice(0, 12).replace(/\s+/g, "_")}.pdf`,
      folderId: "gdrive-bios",
      fileType: "Speaker Bio Profile",
      uploadedBy: `${name} (${uni})`
    });

    // Route uploaded Presentation Deck/Game Build to respective folder
    if (fileObj) {
      const targetFolder = fileObj.name.toLowerCase().endsWith(".zip") ? "gdrive-games" : "gdrive-presentations";
      routeFileToGoogleDrive({
        fileObj,
        fallbackFileName: fileObj.name,
        folderId: targetFolder,
        fileType: targetFolder === "gdrive-games" ? "Playable Game Build" : "Speaker Presentation Deck",
        uploadedBy: `${name} (${uni})`
      });
    }

    state.speakers.unshift(newSpeaker);
    saveState();
    renderSpeakers();
    e.target.reset();
    document.getElementById("bioCreatorCard").style.display = "none";
    addXP(50, `Published Bio & Routed Files to Google Drive for ${name}`);
  });

  // ==========================================
  // TAB 4: ABSTRACT SUBMISSION & GOOGLE DRIVE ROUTING
  // ==========================================
  function populateSubTopicsDropdown(trackNumber, selectedTopic = null) {
    const topicSelect = document.getElementById("absTopicSelect");
    const folderLabel = document.getElementById("liveTargetDriveFolder");
    if (!topicSelect) return;

    const foundTrack = state.tracks.find(t => t.number === trackNumber) || state.tracks[0];
    topicSelect.innerHTML = foundTrack.topics
      .map(top => `<option value="${top}" ${top === selectedTopic ? "selected" : ""}>${top}</option>`)
      .join("");

    const folderId = getTrackDriveFolderId(trackNumber);
    const folderObj = state.googleDriveFolders.find(f => f.id === folderId);
    if (folderLabel && folderObj) {
      folderLabel.textContent = folderObj.path;
    }
  }

  document.getElementById("absTrackSelect")?.addEventListener("change", e => {
    populateSubTopicsDropdown(e.target.value);
  });

  document.getElementById("absText")?.addEventListener("input", e => {
    const words = e.target.value.trim().split(/\s+/).filter(Boolean).length;
    const counter = document.getElementById("absWordCount");
    if (counter) counter.textContent = `${words} words`;
  });

  function renderAbstractsList() {
    const container = document.getElementById("abstractsListContainer");
    if (!container) return;

    container.innerHTML = state.abstracts
      .map(abs => {
        const statusColor =
          abs.status === "Accepted" || abs.status === "Scheduled in Agenda"
            ? "badge-teal"
            : abs.status === "Under Review"
            ? "badge-mustard"
            : "badge-navy";

        return `
        <div class="card">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.4rem; margin-bottom:0.4rem;">
            <span class="badge ${statusColor}">${abs.id} · ${abs.status}</span>
            <span class="badge badge-terracotta">${abs.track} · ${abs.topic}</span>
          </div>
          <h4 style="font-family:var(--font-display); font-size:1.08rem; margin-bottom:0.25rem;">${abs.title}</h4>
          <div style="font-size:0.8rem; font-weight:700; color:var(--wits-blue); margin-bottom:0.4rem;">
            👩‍🏫 ${abs.authors} — <em>${abs.university}</em> (${abs.presentationType})
          </div>
          <p style="font-size:0.82rem; color:var(--ink-brown); margin-bottom:0.6rem;">${abs.abstractText}</p>
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.5rem; font-size:0.76rem; background:var(--bg-cream); padding:0.55rem 0.75rem; border-radius:8px; border:1px solid #dccbb1;">
            <div>
              <div>📎 <strong>File:</strong> ${abs.presentationFileName || "Abstract_Document.pdf"}</div>
              <div style="color:var(--teal-dark); font-family:ui-monospace, monospace;">☁️ Folder: ${abs.gdriveFolderPath || "/EventHub_GameOn_2027/01_Abstracts/"}</div>
            </div>
            <button class="btn btn-outline btn-sm jump-to-review-btn" data-id="${abs.id}">⚖️ Peer Review (${abs.reviews.length})</button>
          </div>
        </div>
      `;
      })
      .join("");

    container.querySelectorAll(".jump-to-review-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        state.activeReviewAbstractId = btn.dataset.id;
        saveState();
        renderPeerReviewWorkspace();
        switchTab("review");
      });
    });
  }

  document.getElementById("abstractSubmissionForm")?.addEventListener("submit", e => {
    e.preventDefault();
    const title = document.getElementById("absTitle").value.trim();
    const authors = document.getElementById("absAuthors").value.trim();
    const university = document.getElementById("absUniversity").value.trim();
    const track = document.getElementById("absTrackSelect").value;
    const topic = document.getElementById("absTopicSelect").value;
    const presentationType = document.getElementById("absFormatSelect").value;
    const email = document.getElementById("absEmail").value.trim();
    const abstractText = document.getElementById("absText").value.trim();

    const absFileObj = document.getElementById("absFileInput")?.files?.[0];
    const slidesFileObj = document.getElementById("absSlidesFileInput")?.files?.[0];

    const trackFolderId = getTrackDriveFolderId(track);
    const trackFolderObj = state.googleDriveFolders.find(f => f.id === trackFolderId);

    // 1. Route Abstract Document to its Track Subfolder (01_Abstracts/Track_X...)
    const routedAbstractFile = routeFileToGoogleDrive({
      fileObj: absFileObj,
      fallbackFileName: `Abstract_${authors.split(",")[0].trim().replace(/\s+/g, "_")}_${track.replace(/\s+/g, "")}.pdf`,
      folderId: trackFolderId,
      fileType: `Abstract (${track})`,
      uploadedBy: `${authors} (${university})`
    });

    // 2. If Slide Deck or Playable Game ZIP was also attached, route it to its respective folder!
    if (slidesFileObj) {
      const isGameZip = slidesFileObj.name.toLowerCase().endsWith(".zip");
      routeFileToGoogleDrive({
        fileObj: slidesFileObj,
        fallbackFileName: slidesFileObj.name,
        folderId: isGameZip ? "gdrive-games" : "gdrive-presentations",
        fileType: isGameZip ? "Playable Game Build (.ZIP)" : "Presentation Slide Deck",
        uploadedBy: `${authors} (${university})`
      });
    }

    const newAbs = {
      id: `ABS-2027-0${state.abstracts.length + 1}`,
      title,
      authors,
      university,
      email,
      track,
      topic,
      presentationType,
      abstractText,
      presentationFileName: slidesFileObj?.name || routedAbstractFile.fileName,
      gdriveFolderPath: trackFolderObj?.path || "/EventHub_GameOn_2027/01_Abstracts/",
      status: "Under Review",
      reviews: []
    };

    state.abstracts.unshift(newAbs);
    state.activeReviewAbstractId = newAbs.id;
    state.activeGDriveFolderFilter = trackFolderId;
    saveState();
    renderAbstractsList();
    renderGoogleDriveExplorer();
    renderPeerReviewWorkspace();
    e.target.reset();
    populateSubTopicsDropdown("TRACK 1");
    document.getElementById("absWordCount").textContent = "0 words";
    addXP(100, `Submitted Abstract ${newAbs.id} & Routed to Google Drive Folder ${trackFolderObj?.name}`);
  });

  // ==========================================
  // TAB 5: ACADEMIC PEER REVIEW WORKSPACE
  // ==========================================
  function renderPeerReviewWorkspace() {
    const queueEl = document.getElementById("reviewQueueContainer");
    if (!queueEl) return;

    const activeAbs = state.abstracts.find(a => a.id === state.activeReviewAbstractId) || state.abstracts[0];
    if (!activeAbs) return;

    queueEl.innerHTML = state.abstracts
      .map(abs => {
        const isSelected = abs.id === activeAbs.id;
        const avg =
          abs.reviews.length > 0
            ? (abs.reviews.reduce((sum, r) => sum + Number(r.totalScore), 0) / abs.reviews.length).toFixed(2)
            : "No scores yet";

        return `
        <div class="card review-queue-item" data-id="${abs.id}" style="cursor:pointer; border-width:${isSelected ? "3px" : "2px"}; background:${isSelected ? "#fff8e6" : "var(--bg-card)"};">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.3rem;">
            <span class="badge badge-navy">${abs.id} · ${abs.track}</span>
            <span class="badge ${abs.status === "Accepted" || abs.status === "Scheduled in Agenda" ? "badge-teal" : "badge-mustard"}">${abs.status}</span>
          </div>
          <h4 style="font-family:var(--font-display); font-size:1rem; margin-bottom:0.2rem;">${abs.title}</h4>
          <div style="font-size:0.78rem; color:var(--ink-muted); font-weight:600;">
            ${abs.authors} (${abs.university}) · ⭐ Avg Score: <strong>${avg}</strong> (${abs.reviews.length} review${abs.reviews.length === 1 ? "" : "s"})
          </div>
        </div>
      `;
      })
      .join("");

    queueEl.querySelectorAll(".review-queue-item").forEach(card => {
      card.addEventListener("click", () => {
        state.activeReviewAbstractId = card.dataset.id;
        saveState();
        renderPeerReviewWorkspace();
      });
    });

    document.getElementById("reviewTargetAbstractId").value = activeAbs.id;
    document.getElementById("reviewActiveIdBadge").textContent = `${activeAbs.id} · ${activeAbs.track} (${activeAbs.topic})`;
    document.getElementById("reviewActiveTitle").textContent = activeAbs.title;
    document.getElementById("reviewActiveMeta").textContent = `Authors: ${activeAbs.authors} · ${activeAbs.university} · Format: ${activeAbs.presentationType} · Drive Folder: ${activeAbs.gdriveFolderPath || "/01_Abstracts/"}`;
    document.getElementById("reviewActiveAbstractText").textContent = activeAbs.abstractText;

    const existingReviewsEl = document.getElementById("existingReviewsList");
    if (existingReviewsEl) {
      if (activeAbs.reviews.length === 0) {
        existingReviewsEl.innerHTML = `<div style="font-size:0.83rem; color:var(--ink-muted);">No peer reviews recorded yet for ${activeAbs.id}. Be the first to evaluate above!</div>`;
      } else {
        existingReviewsEl.innerHTML =
          `<h4 style="font-family:var(--font-display); font-size:1rem; margin-bottom:0.5rem;">Recorded Committee Reviews (${activeAbs.reviews.length})</h4>` +
          activeAbs.reviews
            .map(
              r => `
            <div style="background:var(--bg-cream); border:1.5px solid var(--ink-espresso); border-radius:10px; padding:0.7rem; margin-bottom:0.5rem; font-size:0.82rem;">
              <div style="display:flex; justify-content:space-between; font-weight:700;">
                <span>⚖️ ${r.reviewer}</span>
                <span style="color:var(--teal-dark);">Score: ${r.totalScore}/5.0 · ${r.recommendation}</span>
              </div>
              <p style="margin-top:0.3rem; color:var(--ink-brown);">${r.comments}</p>
            </div>
          `
            )
            .join("");
      }
    }
  }

  ["ThemeFit", "Rigor", "Innovation", "Impact"].forEach(metric => {
    const input = document.getElementById(`score${metric}`);
    const label = document.getElementById(`val${metric}`);
    input?.addEventListener("input", () => {
      if (label) label.textContent = `${input.value} / 5`;
    });
  });

  document.getElementById("peerReviewForm")?.addEventListener("submit", e => {
    e.preventDefault();
    const targetId = document.getElementById("reviewTargetAbstractId").value;
    const abs = state.abstracts.find(a => a.id === targetId);
    if (!abs) return;

    const themeFit = Number(document.getElementById("scoreThemeFit").value);
    const rigor = Number(document.getElementById("scoreRigor").value);
    const innovation = Number(document.getElementById("scoreInnovation").value);
    const impact = Number(document.getElementById("scoreImpact").value);
    const totalScore = Number(((themeFit + rigor + innovation + impact) / 4).toFixed(2));
    const reviewer = document.getElementById("reviewerNameInput").value.trim();
    const recommendation = document.getElementById("reviewRecommendation").value;
    const comments = document.getElementById("reviewComments").value.trim();

    abs.reviews.push({
      reviewer,
      themeFit,
      rigor,
      innovation,
      impact,
      totalScore,
      recommendation,
      comments
    });

    if (recommendation.startsWith("Accept")) {
      abs.status = "Accepted";
    } else if (recommendation.includes("Revise")) {
      abs.status = "Revisions Requested";
    }

    saveState();
    renderPeerReviewWorkspace();
    renderAbstractsList();
    document.getElementById("reviewComments").value = "";
    addXP(75, `Completed Peer Review for ${abs.id} (Avg: ${totalScore}/5.0)`);
  });

  document.getElementById("promoteToAgendaBtn")?.addEventListener("click", () => {
    const targetId = document.getElementById("reviewTargetAbstractId").value;
    const abs = state.abstracts.find(a => a.id === targetId);
    if (!abs) return;

    abs.status = "Scheduled in Agenda";
    const newSession = {
      id: "sess-abs-" + Date.now(),
      day: "Day 2 · Fri 12 Mar 2027",
      startTime: "11:15",
      endTime: "12:00",
      title: abs.title,
      track: abs.track,
      format: abs.presentationType,
      room: "eFundanathi eZone Breakout & Zoom Track Room",
      streamPlatform: "Zoom",
      speaker: abs.authors,
      university: abs.university,
      description: abs.abstractText,
      slidesUrl: abs.presentationFileName,
      saved: true
    };
    state.sessions.push(newSession);
    saveState();
    renderPeerReviewWorkspace();
    renderAbstractsList();
    renderAgenda();
    showToast(`Accepted & Scheduled "${abs.title.slice(0, 36)}..." into the Symposium Agenda!`, "📅");
  });

  // ==========================================
  // TAB 6: HYBRID LIVE STREAM (ZOOM & MS TEAMS)
  // ==========================================
  function renderStreamStage() {
    const selector = document.getElementById("streamRoomSelector");
    if (!selector) return;

    const activeRoom = state.streamRooms.find(r => r.id === state.activeStreamRoomId) || state.streamRooms[0];

    selector.innerHTML = state.streamRooms
      .map(
        r => `
      <button class="chip-btn ${r.id === activeRoom.id ? "active" : ""} switch-stream-room" data-id="${r.id}">
        ${r.platform === "Zoom" ? "🎥 Zoom:" : "🟦 MS Teams:"} ${r.name.split("·")[0].trim()}
      </button>
    `
      )
      .join("");

    selector.querySelectorAll(".switch-stream-room").forEach(btn => {
      btn.addEventListener("click", () => {
        state.activeStreamRoomId = btn.dataset.id;
        saveState();
        renderStreamStage();
      });
    });

    document.getElementById("streamPlatformBadge").textContent = `${activeRoom.platform.toUpperCase()} · ${activeRoom.status}`;
    document.getElementById("streamStageTitle").textContent = activeRoom.currentTitle;
    document.getElementById("streamStageSpeaker").textContent = `${activeRoom.currentSpeaker} · ${activeRoom.name}`;
    document.getElementById("streamRoomCount").textContent = activeRoom.viewersInRoom;
    document.getElementById("streamOnlineCount").textContent = activeRoom.viewersOnline;
    document.getElementById("streamMeetingIdBadge").textContent = `ID: ${activeRoom.meetingId} · Passcode: ${activeRoom.passcode}`;

    const launchBtn = document.getElementById("launchExternalStreamBtn");
    if (launchBtn) {
      launchBtn.href = activeRoom.joinUrl;
      launchBtn.textContent = `🎥 Launch in ${activeRoom.platform} (${activeRoom.name.split("·")[0].trim()})`;
    }

    const qaBox = document.getElementById("liveQaContainer");
    if (qaBox) {
      const sortedQa = [...state.liveQuestions].sort((a, b) => b.upvotes - a.upvotes);
      qaBox.innerHTML = sortedQa
        .map(
          q => `
        <div style="background:var(--bg-cream); border:1.5px solid var(--ink-espresso); border-radius:10px; padding:0.65rem 0.8rem; display:flex; justify-content:space-between; align-items:flex-start; gap:0.65rem;">
          <div>
            <div style="font-size:0.75rem; font-weight:700; color:var(--teal-dark);">
              ${q.author} · <span style="color:var(--ink-muted);">${q.timestamp}</span>
              ${q.answered ? `<span class="badge badge-teal" style="margin-left:0.3rem;">Answered Live</span>` : ""}
            </div>
            <div style="font-size:0.84rem; margin-top:0.2rem; color:var(--ink-espresso);">${q.question}</div>
          </div>
          <button class="chip-btn upvote-qa-btn" data-id="${q.id}" style="flex-shrink:0;">
            ▲ ${q.upvotes}
          </button>
        </div>
      `
        )
        .join("");

      qaBox.querySelectorAll(".upvote-qa-btn").forEach(btn => {
        btn.addEventListener("click", () => {
          const item = state.liveQuestions.find(q => q.id === btn.dataset.id);
          if (item) {
            item.upvotes += 1;
            saveState();
            renderStreamStage();
            addXP(10, "Upvoted a live hybrid Q&A question");
          }
        });
      });
    }
  }

  document.getElementById("configureStreamUrlBtn")?.addEventListener("click", () => {
    const drawer = document.getElementById("streamConfigDrawer");
    if (drawer) drawer.style.display = drawer.style.display === "none" ? "block" : "none";
  });

  document.getElementById("saveStreamConfigBtn")?.addEventListener("click", () => {
    const platform = document.getElementById("customStreamPlatform").value;
    const url = document.getElementById("customStreamUrl").value.trim();
    const activeRoom = state.streamRooms.find(r => r.id === state.activeStreamRoomId);
    if (activeRoom && url) {
      activeRoom.platform = platform;
      activeRoom.joinUrl = url;
      activeRoom.meetingId = url.replace(/^https?:\/\//, "").slice(0, 28);
      saveState();
      renderStreamStage();
      document.getElementById("streamConfigDrawer").style.display = "none";
      showToast(`Updated ${activeRoom.name} to stream via ${platform}!`, "📡");
    }
  });

  document.getElementById("downloadStageSlidesBtn")?.addEventListener("click", () => {
    const activeRoom = state.streamRooms.find(r => r.id === state.activeStreamRoomId);
    showToast(`Downloading "${activeRoom?.handoutFile || "Session_Slides_2027.pdf"}" from Google Drive...`, "📥");
  });

  document.getElementById("claimStreamAttendanceBtn")?.addEventListener("click", () => {
    addXP(50, "Checked in to Hybrid Live Stream Stage at eFundanathi eZone");
  });

  document.getElementById("liveQaForm")?.addEventListener("submit", e => {
    e.preventDefault();
    const input = document.getElementById("liveQaInput");
    const text = input.value.trim();
    if (!text) return;

    state.liveQuestions.unshift({
      id: "qa-" + Date.now(),
      author: `${state.currentUser.name} (${state.currentUser.university})`,
      question: text,
      upvotes: 1,
      answered: false,
      timestamp: "Just now"
    });
    input.value = "";
    saveState();
    renderStreamStage();
    addXP(30, "Asked a question on the Hybrid Live Stage");
  });

  document.querySelectorAll(".poll-vote-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.dataset.option);
      state.pollVotes[idx] += 4;
      const total = state.pollVotes.reduce((a, b) => a + b, 0);
      [0, 1, 2].forEach(i => {
        const pct = Math.round((state.pollVotes[i] / total) * 100);
        const el = document.getElementById(`pollPct${i}`);
        if (el) el.textContent = `${pct}%`;
      });
      saveState();
      addXP(20, "Voted in Live Plenary Poll");
    });
  });

  // ==========================================
  // TAB 7: AMAZING RACE & SCAVENGER HUNT
  // ==========================================
  function renderGamification() {
    const raceContainer = document.getElementById("amazingRaceContainer");
    const scavContainer = document.getElementById("scavengerListContainer");
    const leaderContainer = document.getElementById("universityLeaderboardContainer");
    const summaryEl = document.getElementById("raceProgressSummary");

    if (raceContainer) {
      const completedCount = state.amazingRaceCheckpoints.filter(c => c.completed).length;
      if (summaryEl) {
        summaryEl.textContent = `${completedCount} of ${state.amazingRaceCheckpoints.length} Checkpoints Completed`;
      }

      raceContainer.innerHTML = state.amazingRaceCheckpoints
        .map(
          cp => `
        <div class="checkpoint-card ${cp.completed ? "completed" : ""}">
          <div>
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.5rem;">
              <span class="checkpoint-num">${cp.legNumber}</span>
              <span class="badge ${cp.completed ? "badge-teal" : "badge-mustard"}">
                ${cp.completed ? "✅ UNLOCKED" : `+${cp.points} XP`}
              </span>
            </div>
            <h4 style="font-family:var(--font-display); font-size:1.05rem; margin-bottom:0.2rem;">${cp.title}</h4>
            <div style="font-size:0.75rem; font-weight:700; color:var(--teal-dark); margin-bottom:0.45rem;">📍 ${cp.location}</div>
            <p style="font-size:0.82rem; color:var(--ink-brown);">${cp.clue}</p>
          </div>

          ${
            cp.completed
              ? `<div style="background:#d1fae5; border:1.5px solid #059669; color:#065f46; border-radius:8px; padding:0.45rem 0.65rem; font-size:0.78rem; font-weight:700; text-align:center;">
                  🏆 Leg ${cp.legNumber} Cleared! (+${cp.points} XP Earned)
                </div>`
              : `
                <div>
                  <div style="display:flex; gap:0.35rem; margin-bottom:0.35rem;">
                    <input type="text" class="input-field race-answer-input" data-id="${cp.id}" placeholder="Type answer..." style="width:100%; padding:0.4rem 0.6rem; font-size:0.8rem;" />
                    <button class="btn btn-primary btn-sm submit-race-answer" data-id="${cp.id}">Unlock</button>
                  </div>
                  <button type="button" class="chip-btn show-race-hint" data-hint="${cp.hint}" style="font-size:0.72rem; width:100%;">
                    💡 Need a Hint?
                  </button>
                </div>
              `
          }
        </div>
      `
        )
        .join("");

      raceContainer.querySelectorAll(".submit-race-answer").forEach(btn => {
        btn.addEventListener("click", () => {
          const cp = state.amazingRaceCheckpoints.find(c => c.id === btn.dataset.id);
          const input = raceContainer.querySelector(`.race-answer-input[data-id="${btn.dataset.id}"]`);
          const val = (input?.value || "").toLowerCase().trim();
          if (!cp) return;
          if (cp.acceptedAnswers.some(ans => val.includes(ans))) {
            cp.completed = true;
            addXP(cp.points, `Unlocked Amazing Race Leg ${cp.legNumber}: ${cp.title}!`);
          } else {
            showToast(`Not quite! Click "Need a Hint?" on Leg ${cp.legNumber} for a clue.`, "🧩");
          }
        });
      });

      raceContainer.querySelectorAll(".show-race-hint").forEach(btn => {
        btn.addEventListener("click", () => {
          showToast(`Hint: ${btn.dataset.hint}`, "💡");
        });
      });
    }

    if (scavContainer) {
      scavContainer.innerHTML = state.scavengerChallenges
        .map(
          sc => `
        <div style="background:var(--bg-cream); border:1.5px solid var(--ink-espresso); border-radius:10px; padding:0.65rem 0.85rem; display:flex; justify-content:space-between; align-items:center; gap:0.65rem;">
          <div>
            <div style="font-size:0.86rem; font-weight:700;">
              ${sc.completed ? "✅" : "⬜"} ${sc.title}
            </div>
            <div style="font-size:0.75rem; color:var(--ink-muted);">
              ${sc.category} · Code: <code>${sc.code}</code> · <strong>+${sc.points} XP</strong>
            </div>
          </div>
          ${
            sc.completed
              ? `<span class="badge badge-teal">Stamped</span>`
              : `<button class="btn btn-mustard btn-sm quick-redeem-btn" data-code="${sc.code}">Stamp (+${sc.points} XP)</button>`
          }
        </div>
      `
        )
        .join("");

      scavContainer.querySelectorAll(".quick-redeem-btn").forEach(btn => {
        btn.addEventListener("click", () => redeemScavengerCode(btn.dataset.code));
      });
    }

    if (leaderContainer) {
      leaderContainer.innerHTML = state.universityLeaderboard
        .map(
          (u, idx) => `
        <div style="background:${idx === 0 ? "var(--mustard-light)" : "var(--bg-cream)"}; border:2px solid var(--ink-espresso); border-radius:10px; padding:0.65rem 0.9rem; display:flex; justify-content:space-between; align-items:center;">
          <div style="display:flex; align-items:center; gap:0.65rem;">
            <span class="checkpoint-num" style="background:${idx === 0 ? "var(--terracotta)" : "#fff"}; color:${idx === 0 ? "#fff" : "var(--ink-espresso)"};">
              #${idx + 1}
            </span>
            <div>
              <div style="font-weight:800; font-size:0.9rem;">${u.university}</div>
              <div style="font-size:0.75rem; color:var(--ink-muted);">${u.delegates} Registered Delegates · ${u.badge}</div>
            </div>
          </div>
          <strong style="font-family:var(--font-display); font-size:1.1rem; color:var(--teal-dark);">${u.points.toLocaleString()} XP</strong>
        </div>
      `
        )
        .join("");
    }
  }

  function redeemScavengerCode(rawCode) {
    const code = (rawCode || "").toUpperCase().trim();
    const challenge = state.scavengerChallenges.find(c => c.code === code);
    if (challenge) {
      if (challenge.completed) {
        showToast(`Code ${code} has already been stamped in your passport!`, "✅");
        return;
      }
      challenge.completed = true;
      addXP(challenge.points, `Scavenger Hunt Stamp Unlocked: ${challenge.title}`);
    } else {
      showToast(`Code "${code}" not recognized. Try WITSEZONE, MORABARABA27, UBUNTUNETWORK, PARTNER2027 or PLAYOURSTORIES!`, "🔍");
    }
  }

  document.getElementById("scavengerCodeForm")?.addEventListener("submit", e => {
    e.preventDefault();
    const input = document.getElementById("scavengerCodeInput");
    redeemScavengerCode(input.value);
    input.value = "";
  });

  // ==========================================
  // TAB 8 & BOTTOM WIDGET: SPONSORS & SLIDER
  // ==========================================
  function renderSponsors() {
    const tiersEl = document.getElementById("sponsorTiersContainer");
    const boothsEl = document.getElementById("exhibitorBoothsContainer");
    const sliderTrack = document.getElementById("sponsorSliderTrack");

    if (tiersEl) {
      tiersEl.innerHTML = state.sponsorTiers
        .map(
          t => `
        <div class="card" style="border-top: 6px solid ${t.accent}; display:flex; flex-direction:column; justify-content:space-between;">
          <div>
            <span class="badge badge-mustard" style="margin-bottom:0.4rem;">${t.slots}</span>
            <h3 style="font-family:var(--font-display); font-size:1.2rem;">${t.tier}</h3>
            <div style="font-family:var(--font-display); font-size:1.5rem; font-weight:800; color:var(--teal-dark); margin:0.35rem 0 0.75rem;">
              ${t.priceZAR}
            </div>
            <ul style="font-size:0.8rem; color:var(--ink-brown); padding-left:1.1rem; display:flex; flex-direction:column; gap:0.35rem; margin-bottom:1rem;">
              ${t.perks.map(p => `<li>${p}</li>`).join("")}
            </ul>
          </div>
          <button class="btn btn-outline btn-sm select-sponsor-tier-btn" data-tier="${t.tier} (${t.priceZAR})" style="width:100%;">
            Select ${t.tier.split(" ")[0]} Tier →
          </button>
        </div>
      `
        )
        .join("");

      tiersEl.querySelectorAll(".select-sponsor-tier-btn").forEach(btn => {
        btn.addEventListener("click", () => {
          const select = document.getElementById("spTierSelect");
          if (select) select.value = btn.dataset.tier;
          document.getElementById("sponsorInquiryCard")?.scrollIntoView({ behavior: "smooth" });
          document.getElementById("spOrgName")?.focus();
        });
      });
    }

    if (boothsEl) {
      boothsEl.innerHTML = state.sponsorsList
        .map(
          sp => `
        <div class="card" style="display:flex; justify-content:space-between; align-items:center; gap:1rem; flex-wrap:wrap;">
          <div style="flex:1; min-width:220px;">
            <span class="badge badge-teal" style="margin-bottom:0.25rem;">${sp.tier} · ${sp.category}</span>
            <h4 style="font-family:var(--font-display); font-size:1.15rem;">${sp.name}</h4>
            <p style="font-size:0.83rem; color:var(--ink-brown); margin-top:0.2rem;">${sp.description}</p>
          </div>
          <div style="display:flex; flex-direction:column; gap:0.4rem;">
            <button class="btn ${sp.boothQuestStamped ? "btn-mustard" : "btn-primary"} btn-sm visit-booth-btn" data-id="${sp.id}">
              ${sp.boothQuestStamped ? "✅ Booth Passport Stamped" : "🛂 Stamp Booth Passport (+40 XP)"}
            </button>
          </div>
        </div>
      `
        )
        .join("");

      boothsEl.querySelectorAll(".visit-booth-btn").forEach(btn => {
        btn.addEventListener("click", () => {
          const booth = state.sponsorsList.find(s => s.id === btn.dataset.id);
          if (booth && !booth.boothQuestStamped) {
            booth.boothQuestStamped = true;
            saveState();
            renderSponsors();
            addXP(40, `Visited ${booth.name} Exhibitor Booth & dropped digital card!`);
          } else {
            showToast(`You already stamped your passport at ${booth?.name}!`, "🛂");
          }
        });
      });
    }

    // Render Bottom Sponsors Widget Slider / Carousel
    if (sliderTrack) {
      sliderTrack.innerHTML = state.sponsorsList
        .map(
          sp => `
        <div class="sponsor-slide-card" data-id="${sp.id}">
          <div class="sponsor-logo-placeholder">
            <span>${sp.logoPlaceholder || "🤝 PARTNER LOGO"}</span>
          </div>
          <div>
            <span class="badge badge-teal" style="font-size:0.66rem;">${sp.tier}</span>
            <h4 style="font-family:var(--font-display); font-size:1rem; margin-top:0.25rem;">${sp.name}</h4>
            <p style="font-size:0.75rem; color:var(--ink-muted); margin-top:0.15rem;">${sp.category}</p>
          </div>
        </div>
      `
        )
        .join("");

      sliderTrack.querySelectorAll(".sponsor-slide-card").forEach(card => {
        card.addEventListener("click", () => {
          switchTab("sponsors");
          showToast("Viewing Symposium Sponsors & Partnership Tiers", "🤝");
        });
      });
    }
  }

  // Sponsor Slider Prev / Next & Auto-Scroll
  const sponsorViewport = document.getElementById("sponsorCarouselViewport");
  document.getElementById("slideSponsorsPrevBtn")?.addEventListener("click", () => {
    sponsorViewport?.scrollBy({ left: -290, behavior: "smooth" });
  });
  document.getElementById("slideSponsorsNextBtn")?.addEventListener("click", () => {
    sponsorViewport?.scrollBy({ left: 290, behavior: "smooth" });
  });

  let sponsorAutoScroll = setInterval(() => {
    if (!sponsorViewport) return;
    if (sponsorViewport.scrollLeft + sponsorViewport.clientWidth >= sponsorViewport.scrollWidth - 20) {
      sponsorViewport.scrollTo({ left: 0, behavior: "smooth" });
    } else {
      sponsorViewport.scrollBy({ left: 280, behavior: "smooth" });
    }
  }, 4500);

  sponsorViewport?.addEventListener("mouseenter", () => clearInterval(sponsorAutoScroll));

  document.getElementById("scrollToSponsorFormBtn")?.addEventListener("click", () => {
    document.getElementById("sponsorInquiryCard")?.scrollIntoView({ behavior: "smooth" });
    document.getElementById("spOrgName")?.focus();
  });

  document.getElementById("sponsorInquiryForm")?.addEventListener("submit", e => {
    e.preventDefault();
    const org = document.getElementById("spOrgName").value.trim();
    const contact = document.getElementById("spContactName").value.trim();
    const tier = document.getElementById("spTierSelect").value;
    const notes = document.getElementById("spNotes").value.trim() || "Interactive Playtest & Academic Partnership Showcase at eFundanathi eZone.";
    const logoFileObj = document.getElementById("spLogoFileInput")?.files?.[0];

    if (logoFileObj) {
      routeFileToGoogleDrive({
        fileObj: logoFileObj,
        fallbackFileName: logoFileObj.name,
        folderId: "gdrive-sponsors",
        fileType: "Sponsor Logo / Brochure",
        uploadedBy: `${contact} (${org})`
      });
    }

    state.sponsorsList.unshift({
      id: "sp-" + Date.now(),
      name: org,
      tier: tier.split("(")[0].trim(),
      category: "Confirmed 2027 Partner",
      logoPlaceholder: `🌟 ${org.toUpperCase().slice(0, 18)}`,
      description: notes,
      boothQuestStamped: false
    });
    saveState();
    renderSponsors();
    e.target.reset();
    addXP(100, `Added ${org} to Sponsor Slider & Routed Assets to Google Drive!`);
  });

  // ==========================================
  // FOOTER EMAIL COPY & QUICK INQUIRY FORM
  // ==========================================
  document.querySelectorAll(".copy-email-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const email = btn.dataset.email;
      navigator.clipboard?.writeText(email).catch(() => {});
      showToast(`Copied official symposium email: ${email}`, "📧");
    });
  });

  document.getElementById("footerQuickContactForm")?.addEventListener("submit", e => {
    e.preventDefault();
    const sender = document.getElementById("footerSenderEmail").value.trim();
    const msg = document.getElementById("footerSenderMsg").value.trim();
    const subject = encodeURIComponent(`GO Game-On! Symposium 2027 Inquiry from ${sender}`);
    const body = encodeURIComponent(`${msg}\n\n---\nSent via EventHub (gameon2027.eventhub.wits.ac.za)\nFrom: ${sender}`);
    window.location.href = `mailto:wits.ezone@gmail.com?cc=efundanathi.ezone@wits.ac.za&subject=${subject}&body=${body}`;
    e.target.reset();
    showToast("Opened email client addressed to wits.ezone@gmail.com!", "📨");
  });

  // ==========================================
  // MODALS: LOGIN/REGISTER, SUBDOMAIN, LIGHTBOX
  // ==========================================
  document.getElementById("openAuthModalBtn")?.addEventListener("click", () => {
    document.getElementById("authModal")?.classList.add("open");
  });

  document.getElementById("heroRegisterBtn")?.addEventListener("click", () => {
    document.getElementById("authModal")?.classList.add("open");
  });

  document.getElementById("openNewSubdomainModalBtn")?.addEventListener("click", () => {
    document.getElementById("subdomainModal")?.classList.add("open");
  });

  document.querySelectorAll("[data-close-modal]").forEach(btn => {
    btn.addEventListener("click", () => {
      document.getElementById(btn.dataset.closeModal)?.classList.remove("open");
    });
  });

  // Quick 1-click Demo Role Switcher
  document.querySelectorAll("[data-quick-role]").forEach(btn => {
    btn.addEventListener("click", () => {
      const [label, name, uni, role] = btn.dataset.quickRole.split("|");
      const words = name.replace(/^(Dr\.|Prof\.)\s*/i, "").split(" ");
      const initials = ((words[0]?.[0] || "W") + (words[1]?.[0] || "U")).toUpperCase();

      state.currentUser = {
        name,
        university: uni,
        role,
        initials,
        xp: state.currentUser.xp + 50,
        loggedIn: true
      };
      saveState();
      document.getElementById("authModal")?.classList.remove("open");
      showToast(`Signed in as ${name} (${uni} · ${label})`, "🎓");
    });
  });

  // Full Registration Form
  document.getElementById("registrationForm")?.addEventListener("submit", e => {
    e.preventDefault();
    const name = document.getElementById("regName").value.trim();
    const uni = document.getElementById("regUniversity").value;
    const role = document.getElementById("regRole").value;
    const createBio = document.getElementById("regCreateBio").value;

    const words = name.replace(/^(Dr\.|Prof\.|Mr\.|Ms\.|Mrs\.)\s*/i, "").split(" ");
    const initials = ((words[0]?.[0] || "U") + (words[1]?.[0] || "D")).toUpperCase();

    state.currentUser = {
      name,
      university: uni,
      role: role.split("/")[0].trim(),
      initials,
      xp: (state.currentUser.xp || 250) + 100,
      loggedIn: true
    };

    if (createBio === "yes") {
      state.speakers.unshift({
        id: "spk-reg-" + Date.now(),
        name,
        role,
        title: `${role} · Registered Delegate`,
        university: uni,
        department: "Symposium Participant",
        track: "TRACK 1",
        avatarBg: "#17787e",
        initials,
        bio: `${name} is a registered ${role} from ${uni} attending the GO Game-On! Symposium 2027.`,
        sessionTitle: "Registered Symposium Delegate & Playtester",
        presentationFile: "",
        interests: ["Game-On 2027", "Playful Learning"]
      });
    }

    saveState();
    renderSpeakers();
    document.getElementById("authModal")?.classList.remove("open");
    showToast(`Welcome to GO Game-On! Symposium 2027, ${name} (${uni})! (+100 XP)`, "🎉");
  });

  // Create New University Subdomain Form
  document.getElementById("newSubdomainForm")?.addEventListener("submit", e => {
    e.preventDefault();
    const title = document.getElementById("subEventTitle").value.trim();
    const slug = document.getElementById("subSlug").value.toLowerCase().replace(/[^a-z0-9-]/g, "");
    const dates = document.getElementById("subDates").value.trim();
    const host = document.getElementById("subHost").value.trim();

    const subdomain = `${slug}.eventhub.wits.ac.za`;
    const newEv = {
      id: slug,
      subdomain,
      title,
      dates,
      host,
      venue: "Wits University Hybrid Venue",
      format: "Hybrid",
      status: "Newly Provisioned"
    };

    state.universityEvents.push(newEv);
    state.activeSubdomain = subdomain;
    saveState();
    renderUniversityEventsBar();
    e.target.reset();
    document.getElementById("subdomainModal")?.classList.remove("open");
    showToast(`Provisioned new Wits EventHub subdomain: ${subdomain}!`, "🏛️");
  });

  // Poster Lightbox
  document.querySelectorAll("[data-lightbox-src]").forEach(img => {
    img.addEventListener("click", () => {
      const targetImg = document.getElementById("lightboxImage");
      if (targetImg) targetImg.src = img.dataset.lightboxSrc;
      document.getElementById("lightboxModal")?.classList.add("open");
    });
  });

  // Reset Demo Data
  document.getElementById("resetDemoDataBtn")?.addEventListener("click", () => {
    localStorage.removeItem(STORAGE_KEY);
    state = loadState();
    initAll();
    showToast("Reset EventHub platform data to fresh state!", "↺");
  });

  function initAll() {
    renderUniversityEventsBar();
    updateHeaderCounters();
    renderOverviewTracks();
    populateSubTopicsDropdown("TRACK 1");
    renderAgenda();
    renderSpeakers();
    renderAbstractsList();
    renderGoogleDriveExplorer();
    renderPeerReviewWorkspace();
    renderStreamStage();
    renderGamification();
    renderSponsors();
  }

  initAll();
})();
