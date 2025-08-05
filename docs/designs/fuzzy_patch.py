#!/usr/bin/env python3
import sys
import re


def find_flexible_match(target_lines, hunk_lines, search_start_idx=0):
    """
    Finds a match for hunk_lines within target_lines, allowing for extra
    blank lines in the target that are not in the hunk.

    Args:
        target_lines (list[str]): The lines of the file to be patched.
        hunk_lines (list[str]): The context/removed lines from the hunk.
        search_start_idx (int): The index in target_lines to start searching from.

    Returns:
        tuple[bool, int, int]: A tuple of (found, start_index, end_index+1).
                               Returns (False, -1, -1) if no match is found.
    """
    # The core pattern is the set of non-blank lines we must match in order.
    core_pattern = [line for line in hunk_lines if line]
    if not core_pattern:
        # If hunk is only blank lines, fall back to exact match for that block.
        for i in range(search_start_idx, len(target_lines) - len(hunk_lines) + 1):
            target_slice_stripped = [
                line.rstrip() for line in target_lines[i : i + len(hunk_lines)]
            ]
            if target_slice_stripped == hunk_lines:
                return True, i, i + len(hunk_lines)
        return False, -1, -1

    for i in range(search_start_idx, len(target_lines)):
        pattern_ptr = 0
        target_ptr = i

        # Try to match the first non-blank line of the pattern
        while (
            target_ptr < len(target_lines)
            and target_lines[target_ptr].rstrip() != core_pattern[0]
        ):
            target_ptr += 1

        if target_ptr >= len(target_lines):
            # Could not even find the start of the pattern
            return False, -1, -1

        match_start_idx = target_ptr
        pattern_ptr = 1
        target_ptr += 1

        while pattern_ptr < len(core_pattern) and target_ptr < len(target_lines):
            target_line_stripped = target_lines[target_ptr].rstrip()
            if target_line_stripped == core_pattern[pattern_ptr]:
                pattern_ptr += 1
            elif target_line_stripped != "":
                # Mismatch on a non-blank line, this attempt fails.
                break
            # If it's a blank line, we just skip it by advancing target_ptr
            target_ptr += 1

        if pattern_ptr == len(core_pattern):
            # We successfully matched all non-blank lines in the pattern
            return True, match_start_idx, target_ptr

    return False, -1, -1


def apply_fuzzy_patch(target_file_path, diff_file_path):
    """
    Applies a unified diff from diff_file_path to target_file_path.
    This version is robust to trailing whitespace and missing blank lines
    in the context of the diff. It applies added lines (+) from the diff
    literally.
    """
    try:
        with open(diff_file_path, "r", encoding="utf-8") as f:
            diff_lines_with_newlines = f.readlines()
    except FileNotFoundError:
        print(f"Error: Diff file '{diff_file_path}' not found.", file=sys.stderr)
        return False
    except IOError as e:
        print(f"Error reading diff file '{diff_file_path}': {e}", file=sys.stderr)
        return False

    if not diff_lines_with_newlines:
        return True

    diff_lines_raw = [line.rstrip("\n") for line in diff_lines_with_newlines]
    diff_content_for_split = "\n".join(diff_lines_raw)

    is_new_file_diff = False
    if diff_lines_raw[0].startswith("---") and (
        "/dev/null" in diff_lines_raw[0] or "a/dev/null" in diff_lines_raw[0]
    ):
        is_new_file_diff = True

    target_lines_raw = []
    if is_new_file_diff:
        pass
    else:
        try:
            with open(target_file_path, "r", encoding="utf-8") as f:
                target_lines_raw = [line.rstrip("\n") for line in f.readlines()]
        except FileNotFoundError:
            print(
                f"Error: Target file '{target_file_path}' not found, and diff does not indicate it's a new file.",
                file=sys.stderr,
            )
            return False
        except IOError as e:
            print(
                f"Error reading target file '{target_file_path}': {e}", file=sys.stderr
            )
            return False

    patched_lines_raw = list(target_lines_raw)

    diff_parts = re.split(r"(?=^@@)", diff_content_for_split, flags=re.MULTILINE)

    if (
        diff_parts
        and diff_parts[0]
        and not diff_parts[0].startswith("@@")
        and diff_parts[0].strip()
    ):
        diff_parts.pop(0)

    if not diff_parts or (len(diff_parts) == 1 and not diff_parts[0].strip()):
        return True

    current_file_offset = 0

    for hunk_text in diff_parts:
        hunk_text_stripped_overall = hunk_text.strip()
        if not hunk_text_stripped_overall or not hunk_text_stripped_overall.startswith(
            "@@"
        ):
            continue

        lines_in_hunk_with_header = hunk_text_stripped_overall.splitlines()
        hunk_header = lines_in_hunk_with_header[0]
        hunk_body_lines_raw = lines_in_hunk_with_header[1:]

        header_match = re.match(
            r"@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@", hunk_header
        )
        if not header_match:
            print(f"Error: Could not parse hunk header: {hunk_header}", file=sys.stderr)
            return False

        old_start_line_1idx = int(header_match.group(1))

        current_hunk_original_block_stripped = []
        current_hunk_new_block_raw = []

        for line_in_hunk_body in hunk_body_lines_raw:
            if (
                not line_in_hunk_body
                and len(hunk_body_lines_raw) == 1
                and not line_in_hunk_body.startswith(("-", "+", " "))
            ):
                continue
            if not line_in_hunk_body:
                continue

            op = line_in_hunk_body[0]
            content_raw = line_in_hunk_body[1:]
            content_stripped = content_raw.rstrip()

            if op == " ":
                current_hunk_original_block_stripped.append(content_stripped)
                current_hunk_new_block_raw.append(content_raw)
            elif op == "-":
                current_hunk_original_block_stripped.append(content_stripped)
            elif op == "+":
                current_hunk_new_block_raw.append(content_raw)

        if not current_hunk_original_block_stripped:
            if not current_hunk_new_block_raw:
                continue

            if old_start_line_1idx == 0:
                insertion_point_0idx = current_file_offset
            else:
                insertion_point_0idx = (old_start_line_1idx - 1) + current_file_offset

            insertion_point_0idx = max(
                0, min(insertion_point_0idx, len(patched_lines_raw))
            )

            patched_lines_raw = (
                patched_lines_raw[:insertion_point_0idx]
                + current_hunk_new_block_raw
                + patched_lines_raw[insertion_point_0idx:]
            )
            current_file_offset += len(current_hunk_new_block_raw)
            continue

        found_match_in_target = False
        match_start_idx_0idx = -1
        match_end_idx_0idx = -1

        hint_search_start_0idx = (old_start_line_1idx - 1) + current_file_offset
        search_window_radius = 40  # Increased radius for more flexibility

        window_search_start = max(0, hint_search_start_0idx - search_window_radius)

        # First, search in a small window around the hint line number
        found_match_in_target, match_start_idx_0idx, match_end_idx_0idx = (
            find_flexible_match(
                patched_lines_raw,
                current_hunk_original_block_stripped,
                window_search_start,
            )
        )

        # If not found, search the entire file
        if not found_match_in_target:
            found_match_in_target, match_start_idx_0idx, match_end_idx_0idx = (
                find_flexible_match(
                    patched_lines_raw, current_hunk_original_block_stripped, 0
                )
            )

        if found_match_in_target:
            # The length of the block we are replacing in the target file
            replaced_block_len = match_end_idx_0idx - match_start_idx_0idx

            patched_lines_raw = (
                patched_lines_raw[:match_start_idx_0idx]
                + current_hunk_new_block_raw
                + patched_lines_raw[match_end_idx_0idx:]
            )
            current_file_offset += len(current_hunk_new_block_raw) - replaced_block_len
        else:
            print(
                f"Error: Could not apply hunk starting with: {hunk_header}",
                file=sys.stderr,
            )
            print(
                f"Failed to find this (ignoring blank lines) block in the target file:",
                file=sys.stderr,
            )
            for idx, line_to_find_stripped in enumerate(
                current_hunk_original_block_stripped
            ):
                print(
                    f"  Expected (stripped) line {idx+1}: '{line_to_find_stripped}'",
                    file=sys.stderr,
                )
            return False

    try:
        with open(target_file_path, "w", encoding="utf-8") as f_out:
            if patched_lines_raw:
                f_out.write("\n".join(patched_lines_raw))
                f_out.write("\n")
    except IOError as e:
        print(f"Error writing patched file '{target_file_path}': {e}", file=sys.stderr)
        return False

    return True


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: python fuzzy_patch.py <target_file> <diff_file>", file=sys.stderr)
        sys.exit(1)

    target_file_arg = sys.argv[1]
    diff_file_arg = sys.argv[2]

    if apply_fuzzy_patch(target_file_arg, diff_file_arg):
        sys.exit(0)
    else:
        sys.exit(1)
