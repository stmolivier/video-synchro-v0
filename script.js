const videos = [...document.querySelectorAll("video")];
const videoStatus = document.getElementById("videoStatus");
const timeline = document.getElementById("timeline");
const currentTimeLabel = document.getElementById("currentTime");
const durationLabel = document.getElementById("duration");
const videoFolder = document.getElementById("videoFolder");

let synchronizing = false;
let syncTimer = null;
let seeking = false;

/** Action listeners */
document.getElementById("play").addEventListener("click", () => {
    playAll().catch(() => { });
});

document.getElementById("pause").addEventListener("click", () => {
    pauseAll();
    videoStatus.textContent = "En pause";
});

document.getElementById("stop").addEventListener("click", stopAll);

document.getElementById("restart").addEventListener("click", () => {
    stopAll();
    playAll().catch(() => { });
});

videoFolder.addEventListener("change", () => {
    loadFolder(videoFolder.value);
});

// Stop the 3 feeds if one reaches the end.
videos.forEach(video => {
    video.addEventListener("ended", () => {
        pauseAll();
        videoStatus.textContent = "Lecture terminée";
    });

    video.addEventListener("loadedmetadata", updateDuration);
});

timeline.addEventListener("input", () => {
    seeking = true;
    pauseAll();
    seekAll(Number(timeline.value));
    videoStatus.textContent = "Navigation dans la vidéo";
});

timeline.addEventListener("change", () => {
    seeking = false;
});

function loadFolder(folder) {
    // Stop playing any current synchronization.
    pauseAll();

    // Desactivate time navigation during loading.
    timeline.disabled = true;
    timeline.value = 0;
    timeline.max = 100;
    currentTimeLabel.textContent = "00:00";
    durationLabel.textContent = "00:00";
    videoStatus.textContent = "Chargement...";

    // Load the 3 videos from the selected folder.
    videos.forEach((video, index) => {
        const errorMessage = video.parentElement.querySelector(
            ".camera-error"
        );

        video.pause();
        video.removeAttribute("src");
        video.load();

        if (errorMessage) {
            errorMessage.hidden = true;
        }

        video.src = `videos/${folder}/camera${index + 1}.mp4`;
        video.load();

        video.onerror = () => {
            if (errorMessage) {
                errorMessage.textContent =
                    `Caméra ${index + 1} indisponible`;
                errorMessage.hidden = false;
            }

            video.pause();
            updateDuration();
        };

        video.onloadedmetadata = () => {
            if (errorMessage) {
                errorMessage.hidden = true;
            }

            updateDuration();
        };
    });

    // loadedmetadata events will reactivate the timeline.
}

// load the selected forlder at startup.
loadFolder(videoFolder.value);

function pauseAll() {
    videos.forEach(video => video.pause());
    clearInterval(syncTimer);
    syncTimer = null;
}

function stopAll() {
    pauseAll();
    videos.forEach(video => {
        video.currentTime = 0;
    });
    videoStatus.textContent = "Arrêté";
}

async function playAll() {
    pauseAll();

    // Wait for the metadata be available.
    await Promise.all(videos.map(video => {
        if (video.readyState >= 1) {
            return Promise.resolve();
        }

        return new Promise((resolve, reject) => {
            video.addEventListener("loadedmetadata", resolve, {
                once: true
            });
            video.addEventListener("error", () => {
                reject(new Error("Impossible de charger une vidéo."));
            }, {once: true});
        });
    })).catch(error => {
        videoStatus.textContent = error.message;
        throw error;
    });

    synchronizing = true;

    // Start from the same time in the 3 files.
    const startTime = Math.min(
        ...videos.map(video => video.currentTime)
    );

    videos.forEach(video => {
        video.currentTime = startTime;
    });

    await Promise.all(videos.map(video =>
        video.play().catch(error => {
            videoStatus.textContent =
                "Lecture impossible : " + error.message;
            throw error;
        })
    )).catch(() => {
        pauseAll();
    });

    synchronizing = false;

    if (videos.every(video => !video.paused)) {
        videoStatus.textContent = "Lecture en cours";
        syncTimer = setInterval(synchronize, 250);
    }
}

function synchronize() {
    if (synchronizing) return;

    const reference = videos[0].currentTime;

    synchronizing = true;

    for (const video of videos.slice(1)) {
        const difference = video.currentTime - reference;

        // Corriger les écarts significatifs.
        if (Math.abs(difference) > 0.15) {
            video.currentTime = reference;
        }
    }

    synchronizing = false;
}

function formatTime(seconds) {
    if (!Number.isFinite(seconds)) return "00:00";

    const total = Math.floor(seconds);
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const secs = total % 60;

    const mm = String(minutes).padStart(2, "0");
    const ss = String(secs).padStart(2, "0");

    return hours > 0
        ? `${String(hours).padStart(2, "0")}:${mm}:${ss}`
        : `${mm}:${ss}`;
}

// Initialize the duration when metadata is available.
function updateDuration() {
    const availableVideos = videos.filter(video =>
        video.readyState >= 1 &&
        Number.isFinite(video.duration) &&
        video.duration > 0
    );

    // Wait for each camera to be loaded or in error.
    const allResolved = videos.every(video =>
        video.readyState >= 1 ||
        video.error !== null
    );

    if (!allResolved) {
        return;
    }

    if (availableVideos.length === 0) {
        timeline.disabled = true;
        videoStatus.textContent = "Aucune vidéo disponible";
        return;
    }

    // Use the shortest duration.
    const commonDuration = Math.min(
        ...availableVideos.map(video => video.duration)
    );

    timeline.max = commonDuration;
    timeline.disabled = false;
    durationLabel.textContent = formatTime(commonDuration);

    videoStatus.textContent =
        availableVideos.length === videos.length
            ? "Prêt"
            : `${availableVideos.length}/3 caméras disponibles`;
}

// Move the 3 videos at the same timecode.
function seekAll(time) {
    videos.forEach(video => {
        if (Number.isFinite(video.duration)) {
            video.currentTime = Math.min(time, video.duration);
        }
    });

    timeline.value = time;
    currentTimeLabel.textContent = formatTime(time);
}

// Actualize the bar during playback.
setInterval(() => {
    if (seeking || videos.length === 0) return;

    const time = videos[0].currentTime;

    if (Number.isFinite(time)) {
        timeline.value = time;
        currentTimeLabel.textContent = formatTime(time);
    }
}, 100);