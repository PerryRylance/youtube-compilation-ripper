import { execSync } from 'child_process';
import { existsSync, readFileSync } from "fs";
import { globSync } from "glob";
import parse from "command-line-args";
import color from "cli-color";
import download from "youtube-dl-exec";
import createLogger from "progress-estimator";
import { toS as toSeconds } from "hh-mm-ss";
import escape from "any-shell-escape";
import sanitize from "sanitize-filename";

interface ISong {
	start: string;
	end: string;
	title: string;
	artist: string;
}

function error(message: string)
{
	process.stderr.write(color.white.bgRed(message) + "\r\n");
	process.exit();
}

function warn(message: string)
{
	process.stdout.write(color.black.bgYellow(message) + "\r\n");
}

function pad(input: string, length: number = 2, fill: string = "0")
{
	if(input.length >= length)
		return input;

	let output = "";

	for(let i = input.length; i < length; i++)
		output += fill;

	return output + input;
}

function getDurationSeconds(input: string)
{
	const m = input.match(/\d+/g);

	if(!m || m.length < 2 || m.length > 3)
		error(`Unknown time format '${input}'`);

	const [seconds, minutes] = [m!.pop(), m!.pop()];
	const arr = Array.from(m as any);

	if(arr.length === 0)
		arr.push("00");
	else
		arr[0] = pad(arr[0] as string);

	const corrected = [
		...arr,
		pad(minutes!),
		pad(seconds!)
	]
		.join(":");

	return toSeconds(corrected);
}

const options = parse([
	{
		name: "id",
		alias: "v",
		type: String
	}
]);

if(!("id" in options))
	error("Usage: npm run rip -- --id=[video id]");

async function rip()
{
	const data = `data/${options.id}.json`;

	if(!existsSync(data))
		error(`Song data for ${options.id} not found`);

	const songs: ISong[] = JSON.parse( readFileSync(data, {encoding: "utf-8"}) );
	const matches = globSync(`downloads/${options.id}.*`);

	if(!matches.length)
	{
		const url = `https://www.youtube.com/watch?v=${options.id}`;
		const logger = createLogger();

		const promise = download(url, {
			// dumpSingleJson: true,
			noCheckCertificates: true,
			noWarnings: true,
			preferFreeFormats: true,
			addHeader: ['referer:youtube.com', 'user-agent:googlebot'],
			extractAudio: true,
			audioFormat: "mp3",
			audioQuality: 0,
			output: `/downloads/${options.id}.%(ext)s`
		});

		await logger(promise, `Downloading ${url}...`);
	}

	const input = globSync(`downloads/${options.id}.*`)[0];

	let index = 0;

	for(const song of songs)
	{
		index++;

		const output = `rips/` + sanitize(`${song.artist} - ${song.title}.mp3`);

		if(existsSync(output))
		{
			warn(`${output} already exists`);
			continue;
		}

		process.stdout.write(color.white.bgBlue(`Ripping song ${index} of ${songs.length}`) + "\r\n");

		const start = getDurationSeconds(song.start);
		const end = getDurationSeconds(song.end);
		const length = end - start;

		if(length <= 0)
			error(`Invalid duration for ${song.artist} - ${song.title}`);

		const escaped = {
			input: escape(process.cwd() + "\\" + input),
			output: escape(output),
			title: escape(song.title),
			artist: escape(song.artist)
		};

		let command = `ffmpeg -i ${escaped.input} -ss ${start} -t ${length} -metadata artist=${escaped.artist} -metadata title=${escaped.title} ${escaped.output}`;

		execSync(command);
	}
}

rip();