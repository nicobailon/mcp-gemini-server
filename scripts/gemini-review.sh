#!/bin/bash
# gemini-review.sh
# CLI script for reviewing git diffs with Gemini

# Define colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

# Display progress spinner
function spinner {
  local pid=$1
  local delay=0.1
  local spinstr='|/-\'
  while [ "$(ps a | awk '{print $1}' | grep $pid)" ]; do
    local temp=${spinstr#?}
    printf " [%c]  " "$spinstr"
    local spinstr=$temp${spinstr%"$temp"}
    sleep $delay
    printf "\b\b\b\b\b\b"
  done
  printf "    \b\b\b\b"
}

# Display help information
function show_help {
  echo -e "${BLUE}Gemini Code Review CLI${NC}"
  echo "Usage: gemini-review [options] [git-diff-args]"
  echo ""
  echo "Options:"
  echo "  --focus=FOCUS     Focus of the review: security, performance, architecture, bugs, general (default)"
  echo "  --model=MODEL     Gemini model to use (defaults to server configuration)"
  echo "  --reasoning=LEVEL Reasoning effort: none, low, medium (default), high"
  echo "  --exclude=PATTERN Files to exclude (glob pattern, can be repeated)"
  echo "  --help            Show this help message"
  echo ""
  echo "Examples:"
  echo "  gemini-review                             # Review all uncommitted changes"
  echo "  gemini-review --focus=security HEAD~3..   # Security review of last 3 commits"
  echo "  gemini-review src/                        # Review changes in src directory"
  echo "  gemini-review --reasoning=high            # In-depth review with high reasoning effort"
  echo ""
}

# Set default values
SERVER_URL="http://localhost:3000"
FOCUS="general"
MODEL="gemini-flash-2.0"  # Default to the cheaper Gemini Flash 2.0 model
REASONING="medium"
EXCLUDE_PATTERNS=""

# Parse command line arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --help)
      show_help
      exit 0
      ;;
    --focus=*)
      FOCUS="${1#*=}"
      if [[ ! "$FOCUS" =~ ^(security|performance|architecture|bugs|general)$ ]]; then
        echo -e "${RED}Error: Invalid focus '${FOCUS}'${NC}"
        echo "Valid options: security, performance, architecture, bugs, general"
        exit 1
      fi
      shift
      ;;
    --model=*)
      MODEL="${1#*=}"
      shift
      ;;
    --reasoning=*)
      REASONING="${1#*=}"
      if [[ ! "$REASONING" =~ ^(none|low|medium|high)$ ]]; then
        echo -e "${RED}Error: Invalid reasoning level '${REASONING}'${NC}"
        echo "Valid options: none, low, medium, high"
        exit 1
      fi
      shift
      ;;
    --exclude=*)
      if [ -z "$EXCLUDE_PATTERNS" ]; then
        EXCLUDE_PATTERNS="\"${1#*=}\""
      else
        EXCLUDE_PATTERNS="$EXCLUDE_PATTERNS,\"${1#*=}\""
      fi
      shift
      ;;
    --server=*)
      SERVER_URL="${1#*=}"
      shift
      ;;
    *)
      # Save remaining args for git diff
      break
      ;;
  esac
done

# Prepare URL parameters
URL_PARAMS="reviewFocus=$FOCUS&reasoningEffort=$REASONING"
if [ ! -z "$MODEL" ]; then
  URL_PARAMS="$URL_PARAMS&model=$MODEL"
fi
if [ ! -z "$EXCLUDE_PATTERNS" ]; then
  URL_PARAMS="$URL_PARAMS&excludePatterns=[$EXCLUDE_PATTERNS]"
fi

# Display review information
echo -e "${BLUE}Generating code review using Gemini...${NC}"
echo "Focus: $FOCUS"
echo "Reasoning effort: $REASONING"
if [ ! -z "$MODEL" ]; then
  echo "Model: $MODEL"
else
  echo "Model: Using server default"
fi
if [ ! -z "$EXCLUDE_PATTERNS" ]; then
  echo "Excluding: $EXCLUDE_PATTERNS"
fi

# Generate the diff and send to the API
echo -e "${YELLOW}Fetching git diff...${NC}"

# Use git diff with any remaining args, or default to all uncommitted changes
DIFF_COMMAND="git diff"
if [ $# -gt 0 ]; then
  DIFF_COMMAND="$DIFF_COMMAND $@"
fi

DIFF_OUTPUT=$(eval "$DIFF_COMMAND")

# Check if there's any diff output
if [ -z "$DIFF_OUTPUT" ]; then
  echo -e "${YELLOW}No changes detected in the specified range.${NC}"
  exit 0
fi

DIFF_LENGTH=${#DIFF_OUTPUT}
echo "Diff size: $(($DIFF_LENGTH / 1024)) KB"

# Send request to the API
echo -e "${YELLOW}Sending to Gemini for analysis...${NC}"

# Use curl to send the request and store the response
TEMP_FILE=$(mktemp)
(curl -s -X POST \
  -H "Content-Type: text/plain" \
  --data-binary "$DIFF_OUTPUT" \
  "$SERVER_URL/api/tools/geminiGitLocalDiffReview?$URL_PARAMS" > "$TEMP_FILE") &

# Show spinner while waiting
spinner $!

# Check if the request was successful
if [ ! -s "$TEMP_FILE" ]; then
  echo -e "${RED}Error: No response received from the server.${NC}"
  echo "Please check that the server is running at $SERVER_URL"
  rm "$TEMP_FILE"
  exit 1
fi

# Extract and display the review
REVIEW=$(jq -r '.review' "$TEMP_FILE")
MODEL_USED=$(jq -r '.model' "$TEMP_FILE")
EXECUTION_TIME=$(jq -r '.executionTime' "$TEMP_FILE")

echo -e "${GREEN}Review completed!${NC}"
echo "Model used: $MODEL_USED"
echo "Execution time: $(($EXECUTION_TIME / 1000)).$(($EXECUTION_TIME % 1000)) seconds"
echo ""
echo -e "${BLUE}=== CODE REVIEW ====${NC}"
echo "$REVIEW"

# Clean up
rm "$TEMP_FILE"