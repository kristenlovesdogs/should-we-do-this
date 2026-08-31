document.addEventListener("DOMContentLoaded", function () {
    var form = document.getElementById("evaluate-form");
    var input = document.getElementById("policy-input");
    var emailInput = document.getElementById("email-input");
    var submitBtn = document.getElementById("submit-btn");
    var loading = document.getElementById("loading");
    var loadingText = document.getElementById("loading-text");
    var errorDiv = document.getElementById("error");
    var results = document.getElementById("results");
    var clarification = document.getElementById("clarification");
    var rawFallback = document.getElementById("raw-fallback");
    var shareBtn = document.getElementById("share-btn");

    var loadingMessages = [
        "Sniffing out the research on this one...",
        "Fetching the evidence...",
        "Digging through the data...",
        "Good policy? Sit. Stay. We’re checking...",
        "Retrieving the latest studies...",
        "On the scent of the research...",
        "Tail-wagging analysis incoming...",
        "Pawing through the research...",
        "Even the cats are curious about this one...",
        "Purring through the data..."
    ];
    var loadingInterval = null;
    var lastResultData = null;
    var currentSources = [];

    /* ------------------------------------------------------------------
       Share encoding: the whole analysis rides in the URL fragment, so
       there is nothing to store server-side and links never expire.
       ------------------------------------------------------------------ */

    function bytesToBase64Url(bytes) {
        var binary = "";
        var chunk = 0x8000;
        for (var i = 0; i < bytes.length; i += chunk) {
            binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
        }
        return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    }

    function base64UrlToBytes(str) {
        var padded = str.replace(/-/g, "+").replace(/_/g, "/");
        while (padded.length % 4) padded += "=";
        var binary = atob(padded);
        var out = new Uint8Array(binary.length);
        for (var i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
        return out;
    }

    function encodeShare(payload) {
        var bytes = new TextEncoder().encode(JSON.stringify(payload));
        if (typeof CompressionStream === "undefined") {
            return Promise.resolve("j" + bytesToBase64Url(bytes));
        }
        var stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("deflate-raw"));
        return new Response(stream).arrayBuffer()
            .then(function (buf) { return "z" + bytesToBase64Url(new Uint8Array(buf)); })
            .catch(function () { return "j" + bytesToBase64Url(bytes); });
    }

    function decodeShare(str) {
        var flag = str.charAt(0);
        var bytes = base64UrlToBytes(str.slice(1));
        if (flag === "j") {
            return Promise.resolve(JSON.parse(new TextDecoder().decode(bytes)));
        }
        if (flag !== "z") return Promise.reject(new Error("Unrecognized share format"));
        if (typeof DecompressionStream === "undefined") {
            return Promise.reject(new Error("This browser cannot read compressed share links"));
        }
        var stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
        return new Response(stream).arrayBuffer().then(function (buf) {
            return JSON.parse(new TextDecoder().decode(new Uint8Array(buf)));
        });
    }

    /* ------------------------------------------------------------------
       Loading messages
       ------------------------------------------------------------------ */

    function startLoadingMessages() {
        var index = 0;
        loadingText.textContent = loadingMessages[0];
        loadingInterval = setInterval(function () {
            index = (index + 1) % loadingMessages.length;
            loadingText.textContent = loadingMessages[index];
        }, 3000);
    }

    function stopLoadingMessages() {
        if (loadingInterval) {
            clearInterval(loadingInterval);
            loadingInterval = null;
        }
    }

    /* ------------------------------------------------------------------
       Share button
       ------------------------------------------------------------------ */

    shareBtn.addEventListener("click", function () {
        if (!lastResultData) return;

        var original = "Copy share link";
        shareBtn.disabled = true;
        shareBtn.textContent = "Building link...";

        encodeShare({ p: input.value.trim(), r: lastResultData })
            .then(function (encoded) {
                var url = window.location.origin + "/#s=" + encoded;
                var settled = false;

                function done(label) {
                    if (settled) return;
                    settled = true;
                    shareBtn.textContent = label;
                    setTimeout(function () {
                        shareBtn.disabled = false;
                        shareBtn.textContent = original;
                    }, 2200);
                }

                function fallback() {
                    if (settled) return;
                    settled = true;
                    window.prompt("Copy this link:", url);
                    shareBtn.disabled = false;
                    shareBtn.textContent = original;
                }

                try {
                    navigator.clipboard.writeText(url)
                        .then(function () { done("Link copied"); })
                        .catch(fallback);
                    setTimeout(function () { if (!settled) fallback(); }, 2000);
                } catch (e) {
                    fallback();
                }
            })
            .catch(function () {
                shareBtn.disabled = false;
                shareBtn.textContent = original;
                showError("Could not build a share link for this analysis.");
            });
    });

    /* ------------------------------------------------------------------
       Load a shared analysis from the URL fragment
       ------------------------------------------------------------------ */

    function enterSharedMode(policy) {
        input.value = policy || "";
        form.classList.add("hidden");
        document.getElementById("shared-banner").classList.remove("hidden");
    }

    if (window.EXPIRED_SHARE) {
        document.getElementById("expired-banner").classList.remove("hidden");
    }

    var loadedHash = null;

    function loadFromHash() {
        var hash = window.location.hash || "";
        if (hash.indexOf("#s=") !== 0 || hash === loadedHash) return;
        loadedHash = hash;

        decodeShare(hash.slice(3))
            .then(function (shared) {
                if (!shared || typeof shared !== "object" || !shared.r) {
                    throw new Error("Empty share payload");
                }
                errorDiv.classList.add("hidden");
                enterSharedMode(shared.p);
                if (shared.r.clarification_needed) {
                    results.classList.add("hidden");
                    renderClarification(shared.r);
                } else {
                    clarification.classList.add("hidden");
                    renderResults(shared.r);
                }
            })
            .catch(function () {
                showError("This share link could not be read. It may have been truncated in transit. You can run the analysis again below.");
            });
    }

    // Covers both a cold load and a share link pasted into an already-open tab,
    // where only the fragment changes and the page never reloads.
    loadFromHash();
    window.addEventListener("hashchange", loadFromHash);

    /* ------------------------------------------------------------------
       Form interactions
       ------------------------------------------------------------------ */

    Array.prototype.forEach.call(document.querySelectorAll(".chip"), function (chip) {
        chip.addEventListener("click", function () {
            input.value = chip.getAttribute("data-example") || "";
            input.focus();
            input.setSelectionRange(input.value.length, input.value.length);
        });
    });

    document.getElementById("use-suggestion-btn").addEventListener("click", function () {
        input.value = document.getElementById("clarification-rewrite").value.trim();
        clarification.classList.add("hidden");
        form.dispatchEvent(new Event("submit"));
    });

    document.getElementById("print-btn").addEventListener("click", function () {
        document.getElementById("print-policy-text").textContent = input.value.trim();
        window.print();
    });

    document.getElementById("restart-btn").addEventListener("click", function () {
        window.location.href = window.location.origin + "/";
    });

    form.addEventListener("submit", function (e) {
        e.preventDefault();

        var policy = input.value.trim();
        if (!policy) return;
        var email = emailInput ? emailInput.value.trim() : "";

        results.classList.add("hidden");
        clarification.classList.add("hidden");
        rawFallback.classList.add("hidden");
        errorDiv.classList.add("hidden");
        loading.classList.remove("hidden");
        submitBtn.disabled = true;
        submitBtn.textContent = "Evaluating...";
        startLoadingMessages();

        fetch("/evaluate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ policy: policy, email: email }),
        })
            .then(function (response) {
                var type = response.headers.get("Content-Type") || "";

                // Validation failures come back as plain JSON, not a stream.
                if (type.indexOf("text/event-stream") === -1) {
                    return response.json().then(function (data) {
                        resetForm();
                        showError(data.error || "Something went wrong. Please try again.");
                    });
                }

                return readEventStream(response, function (event, payload) {
                    resetForm();
                    if (event === "error") {
                        showError(payload.error || "Something went wrong. Please try again.");
                    } else if (payload.parse_error) {
                        showRaw(payload.raw_response);
                    } else if (payload.clarification_needed) {
                        renderClarification(payload);
                    } else {
                        renderResults(payload);
                    }
                });
            })
            .catch(function () {
                resetForm();
                showError("The connection dropped before the analysis finished. Please try again.");
            });
    });

    // Minimal SSE reader. EventSource cannot POST, so the stream is parsed by hand.
    function readEventStream(response, onEvent) {
        var reader = response.body.getReader();
        var decoder = new TextDecoder();
        var buffer = "";
        var delivered = false;

        function handleChunk(result) {
            if (result.done) {
                if (!delivered) {
                    resetForm();
                    showError("The analysis ended before it finished. Please try again.");
                }
                return;
            }

            buffer += decoder.decode(result.value, { stream: true });

            var parts = buffer.split("\n\n");
            buffer = parts.pop();

            parts.forEach(function (block) {
                var name = null;
                var data = "";
                block.split("\n").forEach(function (line) {
                    if (line.indexOf("event:") === 0) {
                        name = line.slice(6).trim();
                    } else if (line.indexOf("data:") === 0) {
                        data += line.slice(5).trim();
                    }
                    // lines starting with ":" are keepalive comments; ignore them
                });
                if (!name || !data) return;
                try {
                    delivered = true;
                    onEvent(name, JSON.parse(data));
                } catch (e) {
                    resetForm();
                    showError("The analysis came back in a format we could not read.");
                }
            });

            return reader.read().then(handleChunk);
        }

        return reader.read().then(handleChunk);
    }

    function resetForm() {
        stopLoadingMessages();
        loading.classList.add("hidden");
        submitBtn.disabled = false;
        submitBtn.textContent = "Evaluate this policy";
    }

    function showError(message) {
        errorDiv.textContent = message;
        errorDiv.classList.remove("hidden");
        errorDiv.scrollIntoView({ behavior: "smooth", block: "center" });
    }

    function showRaw(text) {
        document.getElementById("raw-text").textContent = text;
        rawFallback.classList.remove("hidden");
    }

    /* ------------------------------------------------------------------
       Rendering
       ------------------------------------------------------------------ */

    function escapeHtml(str) {
        return String(str == null ? "" : str)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function getSourceUrl(source) {
        if (!source) return null;
        if (source.url && /^https?:\/\//i.test(source.url)) return source.url;
        var query = encodeURIComponent((source.title || "") + " " + (source.author || ""));
        return "https://scholar.google.com/scholar?q=" + query;
    }

    // Escapes first, then turns [1] / [1][2] into linked badges. Everything
    // rendered here can come from a share link, so it is treated as untrusted.
    function withCitations(text) {
        return escapeHtml(text).replace(/(\[\d+\](?:\s*\[\d+\])*)/g, function (match) {
            var badges = match.match(/\[(\d+)\]/g).map(function (n) {
                var num = n.replace(/[\[\]]/g, "");
                var source = currentSources.filter(function (s) {
                    return String(s && s.id) === num;
                })[0];
                var tooltip = source ? (source.title || "") + " — " + (source.author || "") : "Source " + num;
                var url = getSourceUrl(source);
                if (source && url) {
                    return '<a href="' + escapeHtml(url) + '" target="_blank" rel="noopener noreferrer" ' +
                        'class="citation-badge" title="' + escapeHtml(tooltip) + '">' + escapeHtml(num) + '</a>';
                }
                return '<span class="citation-badge" title="' + escapeHtml(tooltip) + '">' + escapeHtml(num) + '</span>';
            });
            return '<span class="citation-cluster">' + badges.join("") + "</span>";
        });
    }

    function renderClarification(data) {
        document.getElementById("clarification-message").textContent = data.message || "";
        var list = document.getElementById("clarification-questions-list");
        list.innerHTML = "";
        (data.questions || []).forEach(function (q) {
            var li = document.createElement("li");
            li.textContent = q;
            list.appendChild(li);
        });
        document.getElementById("clarification-rewrite").value = data.suggested_rewrite || "";
        clarification.classList.remove("hidden");
        clarification.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    function renderResults(data) {
        lastResultData = data;
        currentSources = Array.isArray(data.sources) ? data.sources : [];

        var verdictEl = document.getElementById("verdict");
        var verdictLabel = document.getElementById("verdict-label");

        verdictEl.className = "verdict";
        if (data.verdict === "Green light") {
            verdictEl.classList.add("green");
            verdictLabel.textContent = "✅ Green light";
        } else if (data.verdict === "Proceed with caution") {
            verdictEl.classList.add("caution");
            verdictLabel.textContent = "⚠️ Proceed with caution";
        } else {
            verdictEl.classList.add("reconsider");
            verdictLabel.textContent = "❌ Reconsider";
        }
        document.getElementById("verdict-summary").textContent = data.verdict_summary || "";

        var analysis = data.analysis || {};
        setCard("adoption", analysis.adoption_impact);
        setCard("los", analysis.length_of_stay_impact);
        setCard("save", analysis.save_rate_impact);
        setCard("evidence", analysis.evidence_basis);

        populateList("consequences-list", analysis.unintended_consequences);
        populateList("alternatives-list", analysis.alternatives);
        toggleSection("consequences-section", analysis.unintended_consequences);
        toggleSection("alternatives-section", analysis.alternatives);

        document.getElementById("bottom-line").textContent = data.bottom_line || "";

        renderSources(currentSources);

        results.classList.remove("hidden");
        results.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    function setCard(id, data) {
        var card = document.getElementById("card-" + id);
        if (!data) {
            if (card) card.classList.add("hidden");
            return;
        }
        if (card) card.classList.remove("hidden");
        var badge = document.getElementById("badge-" + id);
        badge.textContent = data.rating || "";
        badge.className = "badge " + (data.rating || "");
        document.getElementById("text-" + id).innerHTML = withCitations(data.explanation || "");
    }

    function toggleSection(sectionId, items) {
        var section = document.getElementById(sectionId);
        if (!section) return;
        section.style.display = items && items.length ? "" : "none";
    }

    function populateList(listId, items) {
        var list = document.getElementById(listId);
        list.innerHTML = "";
        (items || []).forEach(function (item) {
            var li = document.createElement("li");
            li.innerHTML = withCitations(item);
            list.appendChild(li);
        });
    }

    function renderSources(sources) {
        var section = document.getElementById("sources-section");
        var list = document.getElementById("sources-list");
        list.innerHTML = "";

        if (!sources.length) {
            section.style.display = "none";
            return;
        }
        section.style.display = "";

        sources.forEach(function (source) {
            var li = document.createElement("li");
            var url = getSourceUrl(source);
            var title;
            if (url) {
                title = document.createElement("a");
                title.href = url;
                title.target = "_blank";
                title.rel = "noopener noreferrer";
            } else {
                title = document.createElement("span");
            }
            title.className = "source-title";
            title.textContent = source.title || "Untitled source";

            var author = document.createElement("span");
            author.className = "source-author";
            author.textContent = source.author || "";

            li.appendChild(title);
            li.appendChild(author);
            list.appendChild(li);
        });
    }
});
