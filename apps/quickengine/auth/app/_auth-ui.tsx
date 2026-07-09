import { faGithub, faGoogle } from "@fortawesome/free-brands-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

// The shell + form primitives now live in @quickengine/ui; they're re-exported
// here so the auth screens keep importing from one local place. Only the
// FontAwesome social marks stay app-local (auth is the sole user, and it keeps
// the shared UI package dependency-light).
export {
	AuthShell,
	Divider,
	field,
	primaryButton,
	StatusScreen,
	socialButton,
	subtleButton,
	textLink,
} from "@quickengine/ui";

export function GoogleIcon() {
	return <FontAwesomeIcon icon={faGoogle} className="h-4 w-4" />;
}

export function GithubIcon() {
	return <FontAwesomeIcon icon={faGithub} className="h-4 w-4" />;
}
