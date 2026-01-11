import SimpleThemeToggle from "./ui/simple-theme-toggle";

export default function Header() {
  return (
    <div>
      <div className="flex flex-row items-center justify-end px-4 py-2">
        <SimpleThemeToggle />
      </div>
      <hr />
    </div>
  );
}
