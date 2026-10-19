import { Button as Base } from './button.jsx';
import { ButtonGroup, ButtonAddon } from './icon-button.jsx';

/** A button (button.jsx), with its parts Button.Group and Button.Addon, typed. */
export const Button = Object.assign(Base, { Group: ButtonGroup, Addon: ButtonAddon });

export { Pressable } from './button.jsx';
export { IconButton, CloseButton } from './icon-button.jsx';
export { CopyButton } from './copy.jsx';
export { CloseIcon, CheckIcon, ChevronIcon, BackIcon, ForwardIcon, DotsIcon, CopyIcon, ShareIcon, CameraIcon, TagIcon, TrashIcon, EditIcon, EyeIcon, ImageIcon, BanIcon, UndoIcon, MergeIcon, MailIcon, ExitIcon, ShieldIcon } from './icons.jsx';
export { FileButton } from './file.jsx';
