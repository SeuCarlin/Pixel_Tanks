using System;
using System.Drawing;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Threading;
using System.Windows.Forms;
using Microsoft.Win32;

internal static class TankDotsSetup
{
    private const string ResourceName = "TankDotsPayload.zip";
    private static readonly string InstallDirectory = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "TankDots Wars");

    [STAThread]
    private static int Main(string[] args)
    {
        // Build verification extracts into a temporary directory without shortcuts or registry writes.
        if (args.Length == 2 && args[0] == "--extract-test")
        {
            try { ExtractPayload(args[1], null); return 0; }
            catch (Exception error) { File.WriteAllText(Path.Combine(Path.GetTempPath(), "TankDotsSetup-error.txt"), error.ToString()); return 1; }
        }
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        Application.Run(new InstallerWindow());
        return 0;
    }

    private static void ExtractPayload(string destination, Action<int> progress)
    {
        string root = Path.GetFullPath(destination).TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;
        Directory.CreateDirectory(root);
        using (Stream payload = Assembly.GetExecutingAssembly().GetManifestResourceStream(ResourceName))
        {
            if (payload == null) throw new InvalidOperationException("O pacote de instalação está incompleto.");
            using (var archive = new ZipArchive(payload, ZipArchiveMode.Read))
            {
                int count = archive.Entries.Count;
                for (int index = 0; index < count; index++)
                {
                    ZipArchiveEntry entry = archive.Entries[index];
                    string relative = entry.FullName.Replace('/', Path.DirectorySeparatorChar).Replace('\\', Path.DirectorySeparatorChar);
                    if (relative.Length == 0) continue;
                    string target = Path.GetFullPath(Path.Combine(root, relative));
                    if (!target.StartsWith(root, StringComparison.OrdinalIgnoreCase)) throw new InvalidDataException("Caminho inválido dentro do pacote.");
                    if (entry.FullName.EndsWith("/") || entry.FullName.EndsWith("\\")) Directory.CreateDirectory(target);
                    else
                    {
                        Directory.CreateDirectory(Path.GetDirectoryName(target));
                        using (Stream input = entry.Open())
                        using (var output = new FileStream(target, FileMode.Create, FileAccess.Write, FileShare.None)) input.CopyTo(output);
                    }
                    if (progress != null && (index % 12 == 0 || index == count - 1)) progress((index + 1) * 100 / Math.Max(1, count));
                }
            }
        }
        if (!File.Exists(Path.Combine(root, "node.exe")) || !File.Exists(Path.Combine(root, "INICIAR_JOGO.bat")) || !File.Exists(Path.Combine(root, "server", "index.js")))
            throw new InvalidDataException("Faltam arquivos necessários para hospedar uma partida.");
    }

    private static string ValidatePublicOrigin(string input)
    {
        if (String.IsNullOrWhiteSpace(input)) return null;
        Uri uri;
        if (!Uri.TryCreate(input.Trim(), UriKind.Absolute, out uri) || (uri.Scheme != "http" && uri.Scheme != "https") ||
            !String.IsNullOrEmpty(uri.UserInfo) || uri.AbsolutePath != "/" || !String.IsNullOrEmpty(uri.Query) || !String.IsNullOrEmpty(uri.Fragment))
            throw new ArgumentException("Use apenas o endereço base, por exemplo https://meu-host.exemplo ou http://100.64.0.5:3000.");
        return uri.GetLeftPart(UriPartial.Authority);
    }

    private static void CreateShortcut(string shortcutPath, string target, string arguments)
    {
        Type shellType = Type.GetTypeFromProgID("WScript.Shell");
        if (shellType == null) throw new InvalidOperationException("O Windows Script Host não está disponível para criar atalhos.");
        object shell = Activator.CreateInstance(shellType);
        object shortcut = shellType.InvokeMember("CreateShortcut", BindingFlags.InvokeMethod, null, shell, new object[] { shortcutPath });
        Type shortcutType = shortcut.GetType();
        shortcutType.InvokeMember("TargetPath", BindingFlags.SetProperty, null, shortcut, new object[] { target });
        shortcutType.InvokeMember("Arguments", BindingFlags.SetProperty, null, shortcut, new object[] { arguments });
        shortcutType.InvokeMember("WorkingDirectory", BindingFlags.SetProperty, null, shortcut, new object[] { InstallDirectory });
        shortcutType.InvokeMember("Description", BindingFlags.SetProperty, null, shortcut, new object[] { "Hospedar TankDots Wars no seu PC" });
        shortcutType.InvokeMember("Save", BindingFlags.InvokeMethod, null, shortcut, new object[0]);
    }

    private static void RegisterInstallation(string publicUrl)
    {
        if (publicUrl != null) File.WriteAllText(Path.Combine(InstallDirectory, "host-config.json"), "{\"publicUrl\":\"" + publicUrl + "\"}");
        // Updating the game without re-entering the address keeps an existing VPN/public link.
        string menu = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.StartMenu), "Programs", "TankDots Wars");
        Directory.CreateDirectory(menu);
        string launcher = Path.Combine(InstallDirectory, "INICIAR_JOGO.bat");
        CreateShortcut(Path.Combine(menu, "Hospedar TankDots Wars.lnk"), launcher, "");
        CreateShortcut(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), "TankDots Wars.lnk"), launcher, "");
        string powershell = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System), "WindowsPowerShell", "v1.0", "powershell.exe");
        string uninstall = "-NoProfile -ExecutionPolicy Bypass -File \"" + Path.Combine(InstallDirectory, "DESINSTALAR.ps1") + "\"";
        CreateShortcut(Path.Combine(menu, "Desinstalar TankDots Wars.lnk"), powershell, uninstall);
        using (RegistryKey key = Registry.CurrentUser.CreateSubKey(@"Software\Microsoft\Windows\CurrentVersion\Uninstall\TankDotsWars"))
        {
            key.SetValue("DisplayName", "TankDots Wars");
            key.SetValue("DisplayVersion", "1.0.0");
            key.SetValue("Publisher", "TankDots Wars");
            key.SetValue("InstallLocation", InstallDirectory);
            key.SetValue("UninstallString", "\"" + powershell + "\" " + uninstall);
            key.SetValue("NoModify", 1, RegistryValueKind.DWord);
            key.SetValue("NoRepair", 1, RegistryValueKind.DWord);
        }
    }

    private sealed class InstallerWindow : Form
    {
        private readonly TextBox publicAddress = new TextBox();
        private readonly Label status = new Label();
        private readonly ProgressBar progress = new ProgressBar();
        private readonly Button install = new Button();
        private readonly Button host = new Button();

        internal InstallerWindow()
        {
            Text = "Instalar TankDots Wars"; ClientSize = new Size(590, 365); FormBorderStyle = FormBorderStyle.FixedDialog; MaximizeBox = false;
            BackColor = Color.FromArgb(12, 22, 34); ForeColor = Color.FromArgb(226, 242, 237); Font = new Font("Segoe UI", 10);
            AddLabel("TANKDOTS WARS", 25, 21, 535, 42, 24, Color.FromArgb(202, 255, 58));
            AddLabel("Servidor multiplayer no PC de um jogador. Os amigos entram pelo navegador, sem instalar o jogo.", 26, 76, 540, 46, 11, ForeColor);
            AddLabel("Instalação para este usuário:", 26, 130, 530, 24, 10, Color.FromArgb(141, 195, 220));
            AddLabel(InstallDirectory, 26, 151, 530, 24, 10, ForeColor);
            AddLabel("Endereço público ou VPN (opcional; precisa estar acessível aos amigos):", 26, 192, 540, 24, 10, Color.FromArgb(141, 195, 220));
            publicAddress.SetBounds(26, 219, 537, 27); publicAddress.BackColor = Color.FromArgb(24, 42, 59); publicAddress.ForeColor = ForeColor; publicAddress.BorderStyle = BorderStyle.FixedSingle; Controls.Add(publicAddress);
            AddLabel("Na mesma rede, o convite usa o IP local automaticamente. Pela internet, configure VPN ou acesso à porta TCP no roteador.", 26, 253, 540, 41, 9, Color.FromArgb(171, 187, 198));
            progress.SetBounds(26, 302, 350, 19); progress.Style = ProgressBarStyle.Continuous; Controls.Add(progress);
            install.Text = "INSTALAR"; install.SetBounds(392, 299, 171, 34); install.BackColor = Color.FromArgb(202, 255, 58); install.ForeColor = Color.FromArgb(12, 22, 34); install.FlatStyle = FlatStyle.Flat; install.Click += InstallClicked; Controls.Add(install);
            host.Text = "HOSPEDAR AGORA"; host.SetBounds(392, 299, 171, 34); host.Visible = false; host.BackColor = Color.FromArgb(102, 220, 237); host.ForeColor = Color.FromArgb(12, 22, 34); host.FlatStyle = FlatStyle.Flat; host.Click += delegate { System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(Path.Combine(InstallDirectory, "INICIAR_JOGO.bat")) { WorkingDirectory = InstallDirectory, UseShellExecute = true }); Close(); }; Controls.Add(host);
            status.SetBounds(26, 338, 535, 23); status.Text = "Pronto para instalar."; status.ForeColor = Color.FromArgb(171, 187, 198); Controls.Add(status);
        }

        private void AddLabel(string text, int x, int y, int width, int height, int size, Color color)
        {
            var label = new Label(); label.Text = text; label.SetBounds(x, y, width, height); label.Font = new Font("Segoe UI", size, size >= 20 ? FontStyle.Bold : FontStyle.Regular); label.ForeColor = color; Controls.Add(label);
        }

        private void InstallClicked(object sender, EventArgs args)
        {
            string publicUrl;
            try { publicUrl = ValidatePublicOrigin(publicAddress.Text); }
            catch (Exception error) { MessageBox.Show(this, error.Message, "Endereço inválido", MessageBoxButtons.OK, MessageBoxIcon.Warning); return; }
            install.Enabled = false; publicAddress.Enabled = false; status.Text = "Extraindo arquivos...";
            ThreadPool.QueueUserWorkItem(delegate {
                try
                {
                    ExtractPayload(InstallDirectory, delegate(int percent) { BeginInvoke((Action)delegate { progress.Value = Math.Max(0, Math.Min(100, percent)); }); });
                    RegisterInstallation(publicUrl);
                    BeginInvoke((Action)delegate { status.Text = "Instalado. O atalho também está na Área de Trabalho."; install.Visible = false; host.Visible = true; });
                }
                catch (Exception error)
                {
                    BeginInvoke((Action)delegate { install.Enabled = true; publicAddress.Enabled = true; status.Text = "Falha na instalação."; MessageBox.Show(this, error.Message, "TankDots Wars", MessageBoxButtons.OK, MessageBoxIcon.Error); });
                }
            });
        }
    }
}
