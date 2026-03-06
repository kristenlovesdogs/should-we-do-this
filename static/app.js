document.addEventListener("DOMContentLoaded", function () {
    var form = document.getElementById("evaluate-form");
    var input = document.getElementById("policy-input");
    var submitBtn = document.getElementById("submit-btn");
    var loading = document.getElementById("loading");
    var errorDiv = document.getElementById("error");
    var results = document.getElementById("results");
    var clarification = document.getElementById("clarification");
    var rawFallback = document.getElementById("raw-fallback");

    document.getElementById("use-suggestion-btn").addEventListener("click", function () {
        var rewrite = document.getElementById("clarification-rewrite").textContent;
        input.value = rewrite;
        clarification.classList.add("hidden");
        form.dispatchEvent(new Event("submit"));
    });

    document.getElementById("print-btn").addEventListener("click", function () {
        document.getElementById("print-policy-text").textContent = input.value.trim();
        window.print();
    });

    form.addEventListener("submit", function (e) {
        e.preventDefault();

        var policy = input.value.trim();
        if (!policy) return;

        // Reset UI
        results.classList.add("hidden");
        clarification.classList.add("hidden");
        rawFallback.classList.add("hidden");
        errorDiv.classList.add("hidden");
        loading.classList.remove("hidden");
        submitBtn.disabled = true;
        submitBtn.textContent = "Evaluating...";

        fetch("/evaluate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ policy: policy }),
        })
            .then(function (response) {
                return response.json().then(function (data) {
                    return { ok: response.ok, data: data };
                });
            })
            .then(function (result) {
                loading.classList.add("hidden");
                submitBtn.disabled = false;
                submitBtn.textContent = "Evaluate This Policy";

                if (!result.ok) {
                    showError(result.data.error || "Something went wrong. Please try again.");
                    return;
                }

                if (result.data.parse_error) {
                    showRaw(result.data.raw_response);
                    return;
                }

                if (result.data.clarification_needed) {
                    renderClarification(result.data);
                    return;
                }

                renderResults(result.data);
            })
            .catch(function () {
                loading.classList.add("hidden");
                submitBtn.disabled = false;
                submitBtn.textContent = "Evaluate This Policy";
                showError("Could not connect to the server. Make sure the app is running.");
            });
    });

    function showError(message) {
        errorDiv.textContent = message;
        errorDiv.classList.remove("hidden");
    }

    function showRaw(text) {
        document.getElementById("raw-text").textContent = text;
        rawFallback.classList.remove("hidden");
    }

    function renderClarification(data) {
        document.getElementById("clarification-message").textContent = data.message || "";
        populateList("clarification-questions-list", data.questions);
        document.getElementById("clarification-rewrite").textContent = data.suggested_rewrite || "";
        clarification.classList.remove("hidden");
        clarification.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    var currentSources = [];

    function renderResults(data) {
        // Store sources for citation tooltips
        currentSources = data.sources || [];

        // Verdict
        var verdictEl = document.getElementById("verdict");
        var verdictLabel = document.getElementById("verdict-label");
        var verdictSummary = document.getElementById("verdict-summary");

        verdictEl.className = "verdict";
        if (data.verdict === "Green light") {
            verdictEl.classList.add("green");
            verdictLabel.textContent = "\u2705 Green Light";
        } else if (data.verdict === "Proceed with caution") {
            verdictEl.classList.add("caution");
            verdictLabel.textContent = "\u26A0\uFE0F Proceed with Caution";
        } else {
            verdictEl.classList.add("reconsider");
            verdictLabel.textContent = "\u274C Reconsider";
        }
        verdictSummary.textContent = data.verdict_summary || "";

        // Analysis cards
        var analysis = data.analysis || {};

        setCard("adoption", analysis.adoption_impact);
        setCard("los", analysis.length_of_stay_impact);
        setCard("save", analysis.save_rate_impact);
        setCardEvidence("evidence", analysis.evidence_basis);

        // Lists
        populateList("consequences-list", analysis.unintended_consequences);
        populateList("alternatives-list", analysis.alternatives);

        // Bottom line
        document.getElementById("bottom-line").textContent = data.bottom_line || "";

        // Sources
        renderSources(currentSources);

        results.classList.remove("hidden");
        results.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    function injectCitations(text) {
        // Replace [1], [2], etc. with styled citation badges
        // Group adjacent citations like [1][2] into a single cluster
        return text.replace(/(\[\d+\](?:\s*\[\d+\])*)/g, function (match) {
            var nums = match.match(/\[(\d+)\]/g);
            var badges = nums.map(function (n) {
                var num = n.replace(/[\[\]]/g, "");
                var source = currentSources.find(function (s) { return String(s.id) === num; });
                var tooltip = source ? source.title + " — " + source.author : "Source " + num;
                return '<span class="citation-badge" data-source="' + num + '" title="' + tooltip.replace(/"/g, '&quot;') + '">' + num + '</span>';
            });
            return '<span class="citation-cluster">' + badges.join("") + '</span>';
        });
    }

    function setCard(id, data) {
        if (!data) return;
        var badge = document.getElementById("badge-" + id);
        var text = document.getElementById("text-" + id);

        badge.textContent = data.rating;
        badge.className = "badge " + data.rating;
        text.innerHTML = injectCitations(data.explanation || "");
    }

    function setCardEvidence(id, data) {
        if (!data) return;
        var badge = document.getElementById("badge-" + id);
        var text = document.getElementById("text-" + id);

        badge.textContent = data.rating;
        badge.className = "badge " + data.rating;
        text.innerHTML = injectCitations(data.explanation || "");
    }

    function populateList(listId, items) {
        var list = document.getElementById(listId);
        list.innerHTML = "";
        if (!items || !items.length) return;

        items.forEach(function (item) {
            var li = document.createElement("li");
            li.innerHTML = injectCitations(item);
            list.appendChild(li);
        });
    }

    function renderSources(sources) {
        var section = document.getElementById("sources-section");
        var list = document.getElementById("sources-list");
        list.innerHTML = "";

        if (!sources || !sources.length) {
            section.style.display = "none";
            return;
        }

        section.style.display = "";
        sources.forEach(function (source) {
            var li = document.createElement("li");
            li.id = "source-" + source.id;
            li.innerHTML = '<span class="source-title">' + escapeHtml(source.title) + '</span>' +
                '<span class="source-author">' + escapeHtml(source.author) + '</span>';
            list.appendChild(li);
        });
    }

    function escapeHtml(str) {
        var div = document.createElement("div");
        div.textContent = str || "";
        return div.innerHTML;
    }
});
