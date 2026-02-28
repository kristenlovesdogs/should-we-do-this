document.addEventListener("DOMContentLoaded", function () {
    var form = document.getElementById("evaluate-form");
    var input = document.getElementById("policy-input");
    var submitBtn = document.getElementById("submit-btn");
    var loading = document.getElementById("loading");
    var errorDiv = document.getElementById("error");
    var results = document.getElementById("results");
    var rawFallback = document.getElementById("raw-fallback");

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

    function renderResults(data) {
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

        results.classList.remove("hidden");
        results.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    function setCard(id, data) {
        if (!data) return;
        var badge = document.getElementById("badge-" + id);
        var text = document.getElementById("text-" + id);

        badge.textContent = data.rating;
        badge.className = "badge " + data.rating;
        text.textContent = data.explanation || "";
    }

    function setCardEvidence(id, data) {
        if (!data) return;
        var badge = document.getElementById("badge-" + id);
        var text = document.getElementById("text-" + id);

        badge.textContent = data.rating;
        badge.className = "badge " + data.rating;
        text.textContent = data.explanation || "";
    }

    function populateList(listId, items) {
        var list = document.getElementById(listId);
        list.innerHTML = "";
        if (!items || !items.length) return;

        items.forEach(function (item) {
            var li = document.createElement("li");
            li.textContent = item;
            list.appendChild(li);
        });
    }
});
