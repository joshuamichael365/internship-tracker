const $ = (id) => document.getElementById(id);

chrome.storage.sync.get(["appUrl", "token"], (v) => {
  $("appUrl").value = v.appUrl || "http://localhost:3000";
  $("token").value = v.token || "";
});

$("save").addEventListener("click", () => {
  chrome.storage.sync.set({ appUrl: $("appUrl").value.replace(/\/$/, ""), token: $("token").value }, () => {
    $("status").textContent = "Saved ✓";
    setTimeout(() => ($("status").textContent = ""), 1500);
  });
});
