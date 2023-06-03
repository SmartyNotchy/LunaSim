/* Author: Karthik S. Vedula
 * This file contains the main engine for the simulation.  It runs both euler's method and the RK4 method, given input in the form of a json.
 * TODO: FIX EVAL() SECURITY ISSUE 
 */

export class Simulation {
    constructor() {
        this.data;
        this.dt;
        this.startTime;
        this.endTime;
    }

    /*
    Wrapper for eval() that alerts user if there is a ReferenceError.  Does not catch any errors, only alerts.
    TODO: Fully test this function.
    */
    safeEval(expression) {
        // ensure that the expression is only parentheses, numbers, operators, and variables, unless if it is a Math function
        var regex = /[^0-9\(\)\+\-\*\/\%\.\s\[\]a-zA-Z]/g; // TODO: Fully test this regex
        if (regex.test(expression)) {
            return NaN;
        }

        try {
            let res;
            if (expression[0] == "#") { // check if the expression is a uniflow
                res = Math.max(0, eval?.(expression.slice(1)));
            } else {
                res = eval?.(expression);
            }

            return res;
        } catch (e) {
            return NaN;
        }
    }

    /* 
    Replaces names in equation with values.
    Example: 'converter1*converter2+stock1' --> '(1)*(2)+(3)'
    */
    parseObject(equation) {
        let objects = {} // stores all stocks, converters, and flows and their respective equation/safeval

        for (var stock in this.data.stocks) {
            objects[stock] = this.data.stocks[stock]["safeval"];

            // add the inflows and outflows to the available objects
            for (var flow in this.data.stocks[stock]["inflows"]) {
                objects[flow] = this.data.stocks[stock]["inflows"][flow]["equation"];
            }
            for (var flow in this.data.stocks[stock]["outflows"]) {
                objects[flow] = this.data.stocks[stock]["outflows"][flow]["equation"];
            }

        }

        for (var converter in this.data.converters) {
            objects[converter] = this.data.converters[converter]["equation"];
        }

        let sortedObjects = Object.keys(objects).sort((a, b) => a.length - b.length).reverse() // sort by length (descending) to prevent substring errors

        // Call parseObject recursively on all objects to replace the names with their respective values
        for (var object of sortedObjects) {
            if (equation.includes(object)) {
                equation = equation.replace("[" + object + "]", this.parseObject('(' + objects[object] + ')')); // RECURSIVE
            }
        }

        return equation;
    }

    parseAndEval(equation) {       
        var parsedEquation;
        parsedEquation = this.parseObject(equation);

        var res;
        res = this.safeEval(parsedEquation);

        if (isNaN(res)) {
            alert("Error: Invalid equation:\n" + equation + "\n\nParsed equation:\n" + parsedEquation + "\n\nPlease check your equations and try again.")
            throw new Error("Invalid equation");
        } else {
            return res;
        }
    }

    /*
    Applies parseObject initially all values to figure out timestep 0.
    */
    initObjects() {
        for (var stockName in this.data.stocks) {
            let stock = this.data.stocks[stockName];

            let value = this.parseAndEval(stock["equation"]);
            
            stock["safeval"] = value;
            stock["values"] = [value];
        }

        for (var stockName in this.data.stocks) {
            let stock = this.data.stocks[stockName];

            // initialize flows
            for (var flowName in stock["inflows"]) {
                this.data.stocks[stockName]["inflows"][flowName]["values"] = [this.parseAndEval(this.data.stocks[stockName]["inflows"][flowName]["equation"])];
            }
            for (var flowName in stock["outflows"]) {
                this.data.stocks[stockName]["outflows"][flowName]["values"] = [this.parseAndEval(this.data.stocks[stockName]["outflows"][flowName]["equation"])];
            }
        }

        for (var converterName in this.data.converters) {
            this.data.converters[converterName]["values"] = [this.parseAndEval(this.data.converters[converterName]["equation"])];
        }

        // check if any values are null 
        for (var stockName in this.data.stocks) {
            let stock = this.data.stocks[stockName];

            if (stock["values"][0] == null) {
                alert("Error: Invalid equation (maybe circular definition):\n" + stock["equation"] + "\n\nPlease check your equations and try again.")
                throw new Error("Invalid equation");
            }

            for (var flowName in stock["inflows"]) {
                if (stock["inflows"][flowName]["values"][0] == null) {
                    alert("Error: Invalid equation (maybe circular definition):\n" + stock["inflows"][flowName]["equation"] + "\n\nPlease check your equations and try again.")
                    throw new Error("Invalid equation");
                }
            }
            for (var flowName in stock["outflows"]) {
                if (stock["outflows"][flowName]["values"][0] == null) {
                    alert("Error: Invalid equation (maybe circular definition):\n" + stock["outflows"][flowName]["equation"] + "\n\nPlease check your equations and try again.")
                    throw new Error("Invalid equation");
                }
            }
        }

        for (var converterName in this.data.converters) {
            if (this.data.converters[converterName]["values"][0] == null) {
                alert("Error: Invalid equation (maybe circular definition):\n" + this.data.converters[converterName]["equation"] + "\n\nPlease check your equations and try again.")
                throw new Error("Invalid equation");
            }
        }
    }

    /*
    Resets the model to the initial state.  Deletes all values for all objects and sets safevals to null.
    */
    reset() {
        for (var stockName in this.data.stocks) {
            let stock = this.data.stocks[stockName];

            stock["safeval"] = null;
            stock["values"] = [];

            // initialize flows
            for (var flowName in stock["inflows"]) {
                this.data.stocks[stockName]["inflows"][flowName]["values"] = [];
            }
            for (var flowName in stock["outflows"]) {
                this.data.stocks[stockName]["outflows"][flowName]["values"] = [];
            }
        }

        for (var converterName in this.data.converters) {
            this.data.converters[converterName]["values"] = [];
        }

        this.data.timesteps = [];
    }

    /* 
    Uses stock name to return sum of inflows and outflows.
    */
    dydt(stock) {
        // Locally define the inflow and outflows in stock
        let inflows = stock["inflows"];
        let outflows = stock["outflows"];

        // Use eval to get value of flows
        let sumInflow = 0;
        for (var i in inflows) {
            sumInflow += this.parseAndEval(inflows[i]["equation"]);
        }

        let sumOutflow = 0;
        for (var i in outflows) {
            sumOutflow += this.parseAndEval(outflows[i]["equation"]);
        }

        return sumInflow - sumOutflow;
    }

    /*
    Runs model using Euler's method.
    */
    euler() {
        for (var t = this.startTime + this.dt; parseFloat(t.toFixed(5)) <= parseFloat(this.endTime.toFixed(5)); t += this.dt) { // (skip start time as that was covered in this.initObjects())
            this.data.timesteps.push(parseFloat(t.toFixed(5)));
            
            // Calculate new values for all stocks
            for (var stockName in this.data.stocks) {
                let stock = this.data.stocks[stockName];

                if (stock["isNN"] == true) { // check if stock is non-negative
                    stock["values"].push(Math.max(0,(stock["safeval"] + this.dydt(stock) * this.dt)));
                } else {
                    stock["values"].push(stock["safeval"] + this.dydt(stock) * this.dt);
                }
            }

            // Update safeval for next iteration
            for (var stockName in this.data.stocks) { 
                let stock = this.data.stocks[stockName];
                stock["safeval"] = stock["values"][stock["values"].length - 1];
            }

            // Update values for all flows
            for (var stockName in this.data.stocks) {
                for (var inflow in this.data.stocks[stockName]["inflows"]) {
                    this.data.stocks[stockName]["inflows"][inflow]["values"].push(this.parseAndEval(this.data.stocks[stockName]["inflows"][inflow]["equation"]));
                }
                for (var outflow in this.data.stocks[stockName]["outflows"]) {
                    this.data.stocks[stockName]["outflows"][outflow]["values"].push(this.parseAndEval(this.data.stocks[stockName]["outflows"][outflow]["equation"]));
                }
            }

            // Update the values of all converters
            for (var converter in this.data.converters) {
                let converterEq = this.data.converters[converter]["equation"];
                this.data.converters[converter]["values"].push(this.parseAndEval(converterEq));
            }

        }
    }

    /*
    Runs model using 4th order Runge-Kutta method.
    */
    rk4() {
        for (var t = this.startTime + this.dt; parseFloat(t.toFixed(5)) <= parseFloat(this.endTime.toFixed(5)); t += this.dt) { // use high precision to make sure correct number of iterations
            this.data.timesteps.push(parseFloat(t.toFixed(5)));

            let y0_dict = {};
            let k1_dict = {};
            let k2_dict = {};
            let k3_dict = {};
            let k4_dict = {};

            // Set y0 for every stock
            for (var stockName in this.data.stocks) {
                let stock = this.data.stocks[stockName];
                y0_dict[stockName] = stock["safeval"];
            }

            // k1
            for (var stockName in this.data.stocks) { // calculate k1-values for all stocks (perform for all stocks before updating safeval)
                let stock = this.data.stocks[stockName];

                // Calculate constants
                let k1 = this.dydt(stock) * this.dt;
                k1_dict[stockName] = k1;
            }
            for (var stockName in this.data.stocks) { // update safevals with new k1 values
                let stock = this.data.stocks[stockName];
                stock["safeval"] = y0_dict[stockName] + k1_dict[stockName] / 2;
            }

            // k2
            for (var stockName in this.data.stocks) {
                let stock = this.data.stocks[stockName];

                let k2 = this.dydt(stock) * this.dt;
                k2_dict[stockName] = k2;
            }
            for (var stockName in this.data.stocks) {
                let stock = this.data.stocks[stockName];
                stock["safeval"] = y0_dict[stockName] + k2_dict[stockName] / 2;
            }

            // k3
            for (var stockName in this.data.stocks) {
                let stock = this.data.stocks[stockName];

                let k3 = this.dydt(stock) * this.dt;
                k3_dict[stockName] = k3;
            }
            for (var stockName in this.data.stocks) {
                let stock = this.data.stocks[stockName];
                stock["safeval"] = y0_dict[stockName] + k3_dict[stockName];
            }

            // k4 and final value
            for (var stockName in this.data.stocks) {
                let stock = this.data.stocks[stockName];

                let k4 = this.dydt(stock) * this.dt;
                k4_dict[stockName] = k4;
            }
            for (var stockName in this.data.stocks) {
                let stock = this.data.stocks[stockName];

                stock["values"].push(y0_dict[stockName] + (k1_dict[stockName] + 2 * k2_dict[stockName] + 2 * k3_dict[stockName] + k4_dict[stockName]) / 6);
            }
            

            // Update safeval for next iteration
            for (var stockName in this.data.stocks) { 
                let stock = this.data.stocks[stockName];
                stock["safeval"] = stock["values"][stock["values"].length - 1];
            }

            // Update values for all flows
            for (var stockName in this.data.stocks) {
                for (var inflow in this.data.stocks[stockName]["inflows"]) {
                    this.data.stocks[stockName]["inflows"][inflow]["values"].push(this.parseAndEval(this.data.stocks[stockName]["inflows"][inflow]["equation"]));
                }
                for (var outflow in this.data.stocks[stockName]["outflows"]) {
                    this.data.stocks[stockName]["outflows"][outflow]["values"].push(this.parseAndEval(this.data.stocks[stockName]["outflows"][outflow]["equation"]));
                }
            }

            // Update the values of all converters
            for (var converter in this.data.converters) {
                let converterEq = this.data.converters[converter]["equation"];
                this.data.converters[converter]["values"].push(this.parseAndEval(converterEq));
            }
        }
    }

    /*
    Sets the data for the model.  This also resets the model (safevals and values list).
    */
    setData(structData) {
        this.data = structData;
        this.dt = parseFloat(structData.dt);
        this.startTime = parseFloat(structData.start_time);
        this.endTime = parseFloat(structData.end_time);
        this.reset();
    }

    /* 
    Runs the model. 
    This is the function called by frontend.
    */
    run() {
        this.initObjects(); // set initial values

        this.data["timesteps"] = [this.startTime];

        if (this.data["integration_method"] == "euler") {
            this.euler();
        } else if (this.data["integration_method"] == "rk4") {
            this.rk4();
        }

        // return a copy of this.data
        return JSON.parse(JSON.stringify(this.data));
    }
}