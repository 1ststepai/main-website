using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

sealed class StudioWindow : Form {
    readonly string root = AppDomain.CurrentDomain.BaseDirectory;
    readonly WebView2 view = new WebView2 { Dock = DockStyle.Fill };
    readonly Label loading = new Label { Dock = DockStyle.Fill, Text = "Opening 1stStep Studio…", TextAlign = ContentAlignment.MiddleCenter };

    [STAThread] static void Main() {
        // Windows derives the taskbar identity from this executable, matching its pinned shortcut.
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        Application.Run(new StudioWindow());
    }
    StudioWindow() {
        Text = "1stStep Studio"; Width = 1280; Height = 850; MinimumSize = new Size(700, 550);
        Icon = new Icon(Path.Combine(root, "firststep-studio.ico"));
        Controls.Add(loading); Controls.Add(view); loading.BringToFront();
        Shown += async (sender, args) => await OpenStudio();
    }
    async Task OpenStudio() {
        try {
            // Reuse the protected loopback helper and existing paired device; no new cloud credential.
            var start = new ProcessStartInfo(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "nodejs", "node.exe"),
                "\"" + Path.Combine(root, "app", "desktop.mjs") + "\" --window-url") {
                UseShellExecute = false, CreateNoWindow = true, RedirectStandardOutput = true, RedirectStandardError = true, WorkingDirectory = root
            };
            var helper = Process.Start(start);
            helper.ErrorDataReceived += (sender, args) => { }; helper.BeginErrorReadLine();
            var output = helper.StandardOutput.ReadLineAsync();
            if (await Task.WhenAny(output, Task.Delay(20000)) != output) throw new Exception("Studio did not start in time. Reopen the shortcut to retry.");
            Uri launch;
            if (!Uri.TryCreate(await output, UriKind.Absolute, out launch) || launch.Scheme != "http" || launch.Host != "127.0.0.1" || !launch.AbsolutePath.StartsWith("/bootstrap/"))
                throw new Exception("Studio could not establish its protected local connection.");
            string origin = launch.GetLeftPart(UriPartial.Authority);
            var environment = await CoreWebView2Environment.CreateAsync(null, Path.Combine(root, "window-profile"));
            await view.EnsureCoreWebView2Async(environment);
            view.CoreWebView2.PermissionRequested += (sender, args) => args.State = CoreWebView2PermissionState.Deny;
            view.CoreWebView2.NavigationStarting += (sender, args) => {
                Uri target;
                if (!Uri.TryCreate(args.Uri, UriKind.Absolute, out target) || target.GetLeftPart(UriPartial.Authority) != origin) {
                    args.Cancel = true;
                    if (args.IsUserInitiated) OpenExternal(target);
                }
            };
            view.CoreWebView2.NewWindowRequested += (sender, args) => {
                args.Handled = true; Uri target;
                if (args.IsUserInitiated && Uri.TryCreate(args.Uri, UriKind.Absolute, out target)) OpenExternal(target);
            };
            view.CoreWebView2.NavigationCompleted += (sender, args) => {
                if (!args.IsSuccess) { loading.Text = "Studio could not load. Close and reopen this window to retry."; return; }
                loading.Hide();
                File.WriteAllText(Path.Combine(root, "window-ready.json"), "{\"window\":\"FirstStep.Studio\",\"navigation\":\"ready\",\"checked_at\":\"" + DateTime.UtcNow.ToString("o") + "\"}");
            };
            view.CoreWebView2.Navigate(launch.AbsoluteUri);
        } catch (Exception error) { loading.Text = "Studio could not open. " + error.Message; loading.BringToFront(); }
    }
    static void OpenExternal(Uri target) {
        if (target != null && target.Scheme == "https") Process.Start(new ProcessStartInfo(target.AbsoluteUri) { UseShellExecute = true });
    }
}
