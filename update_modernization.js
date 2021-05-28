DataType = Java.type("logbook.data.DataType");
TreeMap = Java.type("java.util.TreeMap");
GlobalContext = Java.type("logbook.data.context.GlobalContext");
File = Java.type("java.io.File");
PrintWriter = Java.type("java.io.PrintWriter");
BufferedWriter = Java.type("java.io.BufferedWriter");
FileWriter = Java.type("java.io.FileWriter");
SimpleDateFormat = Java.type("java.text.SimpleDateFormat");

load("script/ScriptData.js");
data_prefix = "modernization_log";

function store_all_ships()
{
	setTmpData("ships", new TreeMap(GlobalContext.shipMap));
}

function get_ship(uid)
{
	return getData("ships").get(uid);
}

function get_mod(ship)
{
	var t = ship.getJson().api_kyouka;
	return Array.apply(null, Array(t.length)).map(function (x, i) {
		return t[i] | 0;
	}); //Array(n)はlengthがnとなる空配列を返すので、Array.applyで要素をn個入れる（ここではmapやreduceは使えない）
}

function rest_mod(ship)
{
	var o = ship.getJson();
	var mod = get_mod(ship);
	var master = ship.getShipInfo().getJson();

	var max_mod = function (property) {
		return (master[property][1] | 0) - (master[property][0] | 0);
	};
	
	var rest = [];
	rest[0] = max_mod("api_houg") - mod[0];
	rest[1] = max_mod("api_raig") - mod[1];
	rest[2] = max_mod("api_tyku") - mod[2];
	rest[3] = max_mod("api_souk") - mod[3];
	rest[4] = max_mod("api_luck") - mod[4];
	rest[5] = Math.min((master.api_taik[1] | 0) - (o.api_maxhp | 0), 2 - mod[5]);
	rest[6] = ((o.api_taisen[1] | 0) == 0) ? 0 : 9 - mod[6];
	return rest;
}

function get_target(data)
{
	return get_ship(data.getField("api_id") | 0); //理由は知らないけど、減算や単項演算子の+などでは数値に変換できないが、ビット演算ならできる
}

function target(t)
{
	return {
		name: t.getName(),
		rest: rest_mod(t),
		mod: get_mod(t)
	};
}

function get_materials(data)
{
	return data.getField("api_id_items").split(",")
	.map(function(x) {
		return get_ship(x | 0);
	});
}

function material(m)
{
	return {
		name: m.getName(),
		lv: m.getLv(),
		ctype: m.getShipInfo().getJson().api_ctype | 0
	};
}

function log_before(data)
{
	return {
		date: new SimpleDateFormat("yyyy/MM/dd HH:mm:ss").format(data.getCreateDate()),
		target: target(get_target(data)),
		materials: get_materials(data).map(function (x) { return material(x); }),
		success: data.getJsonObject().api_data.api_powerup_flag | 0
	};
}

//保存した艦船データが更新されてから呼び出すこと
function log_after(data, mod)
{
	var m = get_mod(get_target(data));
	var up = function (i) {
		return m[i] - mod[i];
	};
	return m.map(function (x, i) { return m[i] - mod[i]; });
}

//ログのヘッダを出力
function header()
{
	return ["日付", "対象",
		"残り火力up",
		"残り雷装up",
		"残り対空up",
		"残り装甲up",
		"残り運up",
		"残り耐久up",
		"残り対潜up",
		"素材1.名前",
		"素材1.lv",
		"素材1.艦型",
		"素材2.名前",
		"素材2.lv",
		"素材2.艦型",
		"素材3.名前",
		"素材3.lv",
		"素材3.艦型",
		"素材4.名前",
		"素材4.lv",
		"素材4.艦型",
		"素材5.名前",
		"素材5.lv",
		"素材5.艦型",
		"火力up",
		"雷装up",
		"対空up",
		"装甲up",
		"運up",
		"耐久up",
		"対潜up"
	].toString();
}

//ログをCSVに変換
function to_csv(log)
{
	var rest = log.target.rest_mod;
	return [log.date, log.target.name]
	.concat(log.target.rest)
	.concat(log.materials.reduce(function (s, x) {
		return s.concat([x.name, x.lv, x.ctype]);
	}, []))
	.concat(Array.apply(null, Array(5 - log.materials.length)).reduce(function (s, x) {
		return s.concat(["", "", ""]);
	}, []))
	.concat(log.result)
	.toString();
}

function write(name, csv)
{
	try {
		var file = new File(name);
		var append = file.exists();
		var w = new PrintWriter(new BufferedWriter(new FileWriter(file, append)));
		if (!append) {
			w.println(header());
		}
		w.println(csv);
		w.close();
	}
	catch (e) {
		e.printStackTrace();
	}
}

//耐久/対潜が上がらない通常の改修を除外
function filter_log(data)
{
	var materials = get_materials(data);
	var maruyu = materials.reduce(function (s, x) {
		return s || x.getName().contains("まるゆ");
	}, false);
	var kaivo = materials.reduce(function (s, x) {
		return s || x.getStype() == 1;
	}, false);
	
	var target = get_target(data).getName();
	var kamoi = materials.filter(function (x) {
		return x.getName().contains("神威");
	}).length >= 2
	&& ["神威", "瑞穂", "阿賀野", "能代", "矢矧", "酒匂", "大和", "武蔵"].reduce(function (s, x) {
		return s || target.contains(x);
	}, false);
	
	var mizuho = materials.filter(function (x) {
		return x.getName().contains("瑞穂");
	}).length >= 2
	&& ["神威", "瑞穂"].reduce(function (s, x) {
		return x || target.contains(x);
	});
	
	return maruyu || kaivo || kamoi || mizuho;
}

function update(type, data)
{
	if (type == DataType.POWERUP) {
		var log = log_before(data);
		var filter = filter_log(data);
		store_all_ships();

		log.result = log_after(data, log.target.mod);
		var csv = to_csv(log);
		write("modernization_log.txt", csv);
		
		if (filter) {
			write("sp_modernization_log.txt", csv);
		}
	}
	
	//改造（api_get_member/remodelingではshipMapが更新されないので、後続のapi_get_member/materialで保存データを更新する）
	if (type == DataType.PORT || DataType.MATERIAL || DataType.GET_SHIP) {
		store_all_ships();
	}
}