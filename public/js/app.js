(() => {
  const form = document.querySelector("#api-form");
  const output = document.querySelector("#response-output");
  const status = document.querySelector("#response-status");
  const time = document.querySelector("#response-time");
  const copyResponse = document.querySelector("#copy-response");

  if (form) {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const key = document.querySelector("#api-key").value.trim();
      const params = new URLSearchParams();
      for (const name of ["id", "type", "page"]) {
        const value = document.querySelector(`#query-${name}`).value.trim();
        if (value) params.set(name, value);
      }
      status.textContent = "REQUESTING";
      status.className = "tag neutral";
      output.textContent = "Request in progress…";
      copyResponse.disabled = true;
      const started = performance.now();
      try {
        const response = await fetch(`/api/v1/query${params.size ? `?${params.toString()}` : ""}`, {
          method: "POST",
          headers: { "Authorization": `Bearer ${key}`, "Accept": "application/json" }
        });
        const body = await response.text();
        let formatted = body;
        try { formatted = JSON.stringify(JSON.parse(body), null, 2); } catch {}
        output.textContent = formatted;
        status.textContent = `${response.status} ${response.ok ? "OK" : "ERROR"}`;
        status.className = `tag ${response.ok ? "good" : "bad"}`;
        time.textContent = `${Math.round(performance.now() - started)} ms`;
        copyResponse.disabled = false;
      } catch {
        output.textContent = "Network error. Please try again.";
        status.textContent = "FAILED";
        status.className = "tag bad";
        time.textContent = `${Math.round(performance.now() - started)} ms`;
      }
    });
  }

  if (copyResponse) copyResponse.addEventListener("click", async () => {
    await navigator.clipboard.writeText(output.textContent);
    copyResponse.textContent = "Copied";
    setTimeout(() => { copyResponse.textContent = "Copy response"; }, 1200);
  });

  const copyNewKey = document.querySelector("#copy-new-key");
  if (copyNewKey) copyNewKey.addEventListener("click", async () => {
    await navigator.clipboard.writeText(document.querySelector("#new-key-value").textContent.trim());
    copyNewKey.textContent = "Copied";
  });
})();
